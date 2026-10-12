# Applies WatermelonDB's pushChanges payload.
# Conflict policy from PLAN.md: last write wins per record.
class SyncPush
  class Forbidden < StandardError; end

  def initialize(member:, changes:)
    @member = member
    @ranch = member.ranch
    @changes = changes
  end

  def call
    ActiveRecord::Base.transaction do
      # parents before children: observations point at waypoints, photos at observations
      apply(Waypoint, "waypoints") { |record, raw| assign_waypoint(record, raw) }
      apply(Observation, "observations") { |record, raw| assign_observation(record, raw) }
      apply(Photo, "photos") { |record, raw| assign_photo(record, raw) }
      apply(Ride, "rides") { |record, raw| assign_ride(record, raw) }
    end
  end

  private

  def apply(model, table)
    changes = @changes.fetch(table, {})

    Array(changes["created"]).concat(Array(changes["updated"])).each do |raw|
      record = find_or_build(model, raw["id"])
      next if record.deleted_at?

      yield record, raw
      record.save!
    end

    Array(changes["deleted"]).each do |id|
      record = model.find_by(id: id)
      next if record.nil? || record.deleted_at?

      authorize!(record)
      # Raising would fail the whole push and wedge that phone's sync. Touching it
      # instead sends the record back down on the phone's next pull.
      next record.touch unless deletable?(record)

      record.soft_delete!
    end
  end

  def find_or_build(model, id)
    record = model.find_or_initialize_by(id: id)
    record.new_record? ? record.ranch = @ranch : authorize!(record)
    record
  end

  def authorize!(record)
    raise Forbidden, "#{record.class.name} #{record.id} belongs to another ranch" unless record.ranch_id == @ranch.id
  end

  # Only an owner can remove a place, so the crew's gate list can't vanish by accident
  def deletable?(record)
    !record.is_a?(Waypoint) || @member.owner?
  end

  def assign_observation(observation, raw)
    observation.member ||= @member
    observation.assign_attributes(Observation.attributes_from_raw(raw))
  end

  def assign_waypoint(waypoint, raw)
    waypoint.member ||= @member
    waypoint.assign_attributes(Waypoint.attributes_from_raw(raw))
  end

  def assign_ride(ride, raw)
    ride.member ||= @member
    ride.assign_attributes(Ride.attributes_from_raw(raw))
  end

  def assign_photo(photo, raw)
    photo.observation = @ranch.observations.find(raw["observation_id"])
  end
end
