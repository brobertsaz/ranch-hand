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
  # Headquarters and a pasture or two each; every area is storage we pay for and a list the crew scrolls
  MAX_PER_RANCH = 20
  # Each render is thousands of requests to somebody else's imagery server, from inside the web process
  MAX_RENDERING_PER_RANCH = 2

  belongs_to :ranch

  enum :status, { pending: "pending", rendering: "rendering", ready: "ready", failed: "failed" }, validate: true

  validates :name, presence: true, length: { maximum: 60 }
  validates :source, inclusion: { in: ImagerySource::ALL.keys }
  validates :west, :east, numericality: { in: -180..180 }
  validates :south, :north, numericality: { in: -85..85 }
  validate :sensible_box
  validate :ranch_has_room, on: :create

  scope :unfinished, -> { where(status: %i[pending rendering]) }

  def self.padded(west:, south:, east:, north:, margin: MARGIN_METERS)
    # Infinity gets through Float() and then breaks the trigonometry
    raise ArgumentError, "bounds must be finite numbers" unless [ west, south, east, north, margin ].all?(&:finite?)

    dlat = margin / METERS_PER_DEGREE
    dlng = dlat / Math.cos(((south + north) / 2) * Math::PI / 180)
    { west: west - dlng, south: south - dlat, east: east + dlng, north: north + dlat }
  end

  # A square this many miles across, centered on a point. The margin is already in it.
  def self.around(lng:, lat:, miles:) = padded(west: lng, south: lat, east: lng, north: lat, margin: miles * METERS_PER_MILE / 2)

  # Renders run inside the web process, so a restart stops them. This starts them again; they skip stored tiles.
  def self.resume_unfinished = unfinished.find_each { |area| RenderMapAreaJob.perform_later(area) }

  # The state imagery the area sits in, or NAIP; picked by its center when it's made
  def self.source_for(west:, south:, east:, north:) = ImagerySource.for(lng: (west + east) / 2, lat: (south + north) / 2)

  def bounds = { west:, south:, east:, north: }

  def covers?(west:, south:, east:, north:) = west >= self.west && east <= self.east && south >= self.south && north <= self.north

  def imagery = ImagerySource.find(source)

  def max_zoom = imagery.max_zoom

  def tiles = NaipTiles.tiles_in(**bounds, zooms: imagery.zooms)

  # The same tiles as x and y ranges per zoom, for asking "is this tile one of mine" without listing them all
  def tile_ranges = @tile_ranges ||= NaipTiles.ranges_in(**bounds, zooms: imagery.zooms)

  def tile?(z, x, y)
    xs, ys = tile_ranges[z]
    xs ? xs.cover?(x) && ys.cover?(y) : false
  end

  def estimated_tiles = NaipTiles.count_in(**bounds, zooms: imagery.zooms)

  def estimated_megabytes = (estimated_tiles * KILOBYTES_PER_TILE / 1000.0).ceil

  def estimated_minutes = [ (estimated_tiles * imagery.seconds_per_tile / 60).ceil, 1 ].max

  private

  def sensible_box
    # A side that's missing or off the map already has its own error, and would break the tile arithmetic below
    return if errors.any? || [ west, south, east, north ].any? { |v| !v.is_a?(Numeric) }
    return errors.add(:base, "West must be less than east and south less than north") unless west < east && south < north
    errors.add(:base, "Area is too big to sharpen (#{estimated_tiles} tiles, limit #{MAX_TILES})") if estimated_tiles > MAX_TILES
  end

  # Callers hold the ranch's lock (ranch.with_lock), so two requests can't both take the last spot
  def ranch_has_room
    return unless ranch

    if ranch.map_areas.count >= MAX_PER_RANCH
      errors.add(:base, "This ranch already has #{MAX_PER_RANCH} sharp areas. Remove one before adding another.")
    elsif ranch.map_areas.unfinished.count >= MAX_RENDERING_PER_RANCH
      errors.add(:base, "#{MAX_RENDERING_PER_RANCH} areas are still being sharpened. Wait for one to finish before adding another.")
    end
  end
end
