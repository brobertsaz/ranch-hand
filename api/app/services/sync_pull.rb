# Builds the response for WatermelonDB's pullChanges.
# https://watermelondb.dev/docs/Sync/Backend
class SyncPull
  # Re-send anything touched just before the last pull, in case its transaction
  # committed after that pull read the table. Watermelon handles the duplicates.
  OVERLAP = 2.seconds

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

  # Members aren't soft-deleted (nobody leaves a ranch in the app yet), so only additions and renames
  def member_changes
    members = @since ? @ranch.members.where(updated_at: @since..) : @ranch.members
    { created: [], updated: members.map(&:to_raw), deleted: [] }
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
