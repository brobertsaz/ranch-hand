# Pulls every NAIP tile for a map area into storage. Tiles already stored are
# skipped, so running it again after a crash or restart picks up where it left off.
class RenderMapAreaJob < ApplicationJob
  # The ImageServer is slow per tile but takes parallel requests
  THREADS = 8
  # The ImageServer throws the odd 502 under load; five tries with backoff (about 30 s) rides those out
  ATTEMPTS = 5

  def perform(map_area)
    map_area.update!(status: :rendering, error: nil)
    queue = Queue.new
    map_area.tiles.each { |tile| queue << tile }
    queue.close
    failures = Queue.new

    threads = Array.new(THREADS) do
      Thread.new do
        # Without the executor, a worker that autoloads a constant waits forever on the joining thread
        Rails.application.executor.wrap do
          while (tile = queue.pop)
            begin
              render(tile)
            rescue StandardError => e
              failures << e.message
            end
          end
        end
      end
    end
    ActiveSupport::Dependencies.interlock.permit_concurrent_loads { threads.each(&:join) }

    if failures.empty?
      map_area.update!(status: :ready, tile_count: map_area.tiles.size, rendered_at: Time.current)
    else
      map_area.update!(status: :failed, error: "#{failures.size} tiles failed, e.g. #{failures.pop}")
    end
  end

  private

  def render((z, x, y))
    return if NaipTiles.stored?(z, x, y)
    attempt = 0
    begin
      NaipTiles.fetch_and_store(z, x, y)
    rescue StandardError
      attempt += 1
      raise if attempt >= ATTEMPTS
      sleep 2**attempt
      retry
    end
  end
end
