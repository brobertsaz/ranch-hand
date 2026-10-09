class Ride < ApplicationRecord
  include Syncable

  belongs_to :ranch
  belongs_to :member

  validates :id, :started_at, :ended_at, presence: true
  validates :distance_meters, numericality: { greater_than_or_equal_to: 0 }
  validates :name, length: { maximum: 80 }
  validate :track_is_coordinates
  validate :ends_after_it_starts

  def self.attributes_from_raw(raw)
    {
      started_at: Syncable.from_ms(raw["started_at"]),
      ended_at: Syncable.from_ms(raw["ended_at"]),
      distance_meters: raw["distance_meters"],
      # Optional, e.g. "North pasture via the creek gate"; the crew follows rides by name
      name: raw["name"].presence&.strip,
      # The phone stores the track as JSON text in SQLite
      track: raw["track"].is_a?(String) ? JSON.parse(raw["track"]) : raw["track"]
    }
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
    errors.add(:track, "must be a list of [longitude, latitude] points") unless valid
  end

  def ends_after_it_starts
    errors.add(:ended_at, "is before the ride started") if started_at && ended_at && ended_at < started_at
  end
end
