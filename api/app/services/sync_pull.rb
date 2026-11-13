# Builds the response for WatermelonDB's pullChanges.
# https://watermelondb.dev/docs/Sync/Backend
class SyncPull
  # Re-send anything touched shortly before the last pull. A record's updated_at is set when it's saved,
  # but other phones can't see it until its transaction commits; a pull that lands in between hands out a
  # timestamp later than that updated_at, and without the overlap no later pull would ever send the record.
  #
  # The window has to outlast the slowest commit (a big push, a photo upload on a loaded server), and a miss
  # is permanent, so it's generous. The cost is that every pull repeats the last few minutes of changes,
  # which the phone upserts by id without calling them news. Rows saved under the old 2 second window that
  # were already missed aren't recovered by this.
  OVERLAP = 5.minutes

  def initialize(ranch:, last_pulled_at:)
    @ranch = ranch
    @since = Syncable.from_ms(last_pulled_at)&.-(OVERLAP)
  end

  def call
    timestamp = Syncable.to_ms(Time.current)

    {
      changes: {
        members: member_changes,
        waypoints: changes_for(@ranch.waypoints),
        observations: changes_for(@ranch.observations),
        photos: changes_for(@ranch.photos),
        rides: changes_for(@ranch.rides)
      },
      timestamp: timestamp
    }
  end

  private

  # The whole crew every time: it's a short list, and a phone that synced before names existed
  # would otherwise never hear about members who haven't changed since
  def member_changes
    { created: [], updated: @ranch.members.map(&:to_raw), deleted: [] }
  end

  def changes_for(scope)
    if @since.nil?
      { created: scope.live.map(&:to_raw), updated: [], deleted: [] }
    else
      {
        created: [],
        updated: scope.changed_since(@since).map(&:to_raw),
        deleted: scope.deleted_since(@since).pluck(:id)
      }
    end
  end
end
