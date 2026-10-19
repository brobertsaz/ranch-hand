# A part of the ranch that gets sharp (zoom 17 and up) aerial tiles. A ranch has
# several because pastures can sit miles apart.
class MapArea < ApplicationRecord
  # Nobody knows exactly where a pasture ends, so every area reaches a bit past what was asked for
  MARGIN_METERS = 400
  # About 100,000 acres at zoom 18, and an overnight render
  MAX_TILES = 50_000
  METERS_PER_DEGREE = 111_320.0
  METERS_PER_MILE = 1609.344
  # Area 1 (Wisconsin, 1,919 tiles) came to 39 MB on the phone
  KILOBYTES_PER_TILE = 20

  belongs_to :ranch

  enum :status, { pending: "pending", rendering: "rendering", ready: "ready", failed: "failed" }, validate: true

  validates :name, presence: true, length: { maximum: 60 }
  validates :source, inclusion: { in: ImagerySource::ALL.keys }
  validates :west, :east, numericality: { in: -180..180 }
  validates :south, :north, numericality: { in: -85..85 }
  validate :sensible_box

  def self.padded(west:, south:, east:, north:, margin: MARGIN_METERS)
    dlat = margin / METERS_PER_DEGREE
    dlng = dlat / Math.cos(((south + north) / 2) * Math::PI / 180)
    { west: west - dlng, south: south - dlat, east: east + dlng, north: north + dlat }
  end

  # A square this many miles across, centered on a point. The margin is already in it.
  def self.around(lng:, lat:, miles:) = padded(west: lng, south: lat, east: lng, north: lat, margin: miles * METERS_PER_MILE / 2)

  # Renders run inside the web process, so a restart stops them. This starts them again; they skip stored tiles.
  def self.resume_unfinished = where(status: %i[pending rendering]).find_each { |area| RenderMapAreaJob.perform_later(area) }

  # The state imagery the area sits in, or NAIP; picked by its center when it's made
  def self.source_for(west:, south:, east:, north:) = ImagerySource.for(lng: (west + east) / 2, lat: (south + north) / 2)

  def bounds = { west:, south:, east:, north: }

  def covers?(west:, south:, east:, north:) = west >= self.west && east <= self.east && south >= self.south && north <= self.north

  def imagery = ImagerySource.find(source)

  def max_zoom = imagery.max_zoom

  def tiles = NaipTiles.tiles_in(**bounds, zooms: imagery.zooms)

  def estimated_tiles = NaipTiles.count_in(**bounds, zooms: imagery.zooms)

  def estimated_megabytes = (estimated_tiles * KILOBYTES_PER_TILE / 1000.0).ceil

  def estimated_minutes = [ (estimated_tiles * imagery.seconds_per_tile / 60).ceil, 1 ].max

  private

  def sensible_box
    return if [ west, south, east, north ].any? { |v| !v.is_a?(Numeric) }
    return errors.add(:base, "West must be less than east and south less than north") unless west < east && south < north
    errors.add(:base, "Area is too big to sharpen (#{estimated_tiles} tiles, limit #{MAX_TILES})") if estimated_tiles > MAX_TILES
  end
end
