# A part of the ranch that gets sharp (zoom 17-18) aerial tiles. A ranch has
# several because pastures can sit miles apart.
class MapArea < ApplicationRecord
  # Nobody knows exactly where a pasture ends, so every area reaches a bit past what was asked for
  MARGIN_METERS = 400
  # About 100,000 acres at zoom 18, and an overnight render
  MAX_TILES = 50_000
  METERS_PER_DEGREE = 111_320.0

  belongs_to :ranch

  enum :status, { pending: "pending", rendering: "rendering", ready: "ready", failed: "failed" }, validate: true

  validates :name, presence: true
  validates :west, :east, numericality: { in: -180..180 }
  validates :south, :north, numericality: { in: -85..85 }
  validate :sensible_box

  def self.padded(west:, south:, east:, north:, margin: MARGIN_METERS)
    dlat = margin / METERS_PER_DEGREE
    dlng = dlat / Math.cos(((south + north) / 2) * Math::PI / 180)
    { west: west - dlng, south: south - dlat, east: east + dlng, north: north + dlat }
  end

  def bounds = { west:, south:, east:, north: }

  def tiles = NaipTiles.tiles_in(**bounds)

  def estimated_tiles = NaipTiles.count_in(**bounds)

  private

  def sensible_box
    return if [ west, south, east, north ].any? { |v| !v.is_a?(Numeric) }
    return errors.add(:base, "West must be less than east and south less than north") unless west < east && south < north
    errors.add(:base, "Area is too big to sharpen (#{estimated_tiles} tiles, limit #{MAX_TILES})") if estimated_tiles > MAX_TILES
  end
end
