class Ride < ApplicationRecord
  include Syncable

  belongs_to :ranch
  belongs_to :member

  # A point every 5 seconds for almost three days; past that it isn't a ride
  MAX_TRACK_POINTS = 50_000

  validates :id, :started_at, :ended_at, presence: true
  validates :distance_meters, numericality: { greater_than_or_equal_to: 0 }
  validates :name, length: { maximum: 80 }
  validate :track_is_coordinates
  validate :ends_after_it_starts

  def self.attributes_from_raw(raw)
    started_at = Syncable.from_ms(raw["started_at"])
    ended_at = Syncable.from_ms(raw["ended_at"])
    {
      started_at: started_at,
      # A phone whose clock was corrected mid-ride can end before it started. The track is still worth
      # keeping, so the ride is taken as ending when it began rather than turned away.
      ended_at: started_at && ended_at && ended_at < started_at ? started_at : ended_at,
      distance_meters: raw["distance_meters"],
      # Optional, e.g. "North pasture via the creek gate"; the crew follows rides by name
      name: raw["name"].to_s.strip.presence,
      track: parse_track(raw["track"])
    }
  end

  # The phone stores the track as JSON text in SQLite. Text that isn't JSON comes back nil, which fails validation.
  def self.parse_track(track)
    track.is_a?(String) ? JSON.parse(track) : track
  rescue JSON::ParserError
    nil
  end

  def to_raw
    {
      id: id,
      member_id: member_id.to_s,
      started_at: Syncable.to_ms(started_at),
      ended_at: Syncable.to_ms(ended_at),
      distance_meters: distance_meters,
      name: name,
      track: track.to_json
    }
  end

  private

  def track_is_coordinates
    valid = track.is_a?(Array) && track.all? { |point| point.is_a?(Array) && point.size >= 2 && point.first(2).all?(Numeric) }
    return errors.add(:track, "must be a list of [longitude, latitude] points") unless valid
    errors.add(:track, "has more than #{MAX_TRACK_POINTS} points") if track.size > MAX_TRACK_POINTS
  end

  def ends_after_it_starts
    errors.add(:ended_at, "is before the ride started") if started_at && ended_at && ended_at < started_at
  end
end
