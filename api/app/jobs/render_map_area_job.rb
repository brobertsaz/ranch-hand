# Pulls every NAIP tile for a map area into storage. Tiles already stored are
# skipped, so running it again after a crash or restart picks up where it left off.
class RenderMapAreaJob < ApplicationJob
  # The ImageServer is slow per tile but takes parallel requests
  THREADS = 8
  # The ImageServer throws the odd 502 under load; five tries with backoff (about 30 s) rides those out
  ATTEMPTS = 5
  # How many tiles go by between progress saves, which also notice an area that was removed
  CHECK_EVERY = 25

  # Removed before the render started
  discard_on ActiveJob::DeserializationError

  def perform(map_area)
    map_area.update!(status: :rendering, error: nil)
    source = map_area.imagery
    queue = Queue.new
    map_area.tiles.each { |tile| queue << tile }
    queue.close
    failures = Queue.new
    rendered = Concurrent::AtomicFixnum.new

    threads = Array.new(THREADS) do
      Thread.new do
        # Without the executor, a worker that autoloads a constant waits forever on the joining thread
        Rails.application.executor.wrap do
          while (tile = queue.pop)
            count = rendered.increment
            break if (count % CHECK_EVERY).zero? && MapArea.where(id: map_area.id).update_all(tile_count: count).zero?
            begin
              render(tile, source)
            rescue StandardError => e
              failures << e.message
            end
          end
        end
      end
    end
    ActiveSupport::Dependencies.interlock.permit_concurrent_loads { threads.each(&:join) }

    return unless MapArea.exists?(map_area.id)

    if failures.empty?
      map_area.update!(status: :ready, tile_count: map_area.tiles.size, rendered_at: Time.current)
    else
      map_area.update!(status: :failed, error: "#{failures.size} tiles failed, e.g. #{failures.pop}")
    end
  end

  private

  def render((z, x, y), source)
    return if NaipTiles.stored?(z, x, y, source.key)
    attempt = 0
    begin
      NaipTiles.fetch_and_store(z, x, y, source)
    rescue StandardError
      attempt += 1
      raise if attempt >= ATTEMPTS
      sleep 2**attempt
      retry
    end
  end
end
