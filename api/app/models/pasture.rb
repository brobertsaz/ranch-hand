# A fenced pasture, outlined on the phone by riding its fence line. It syncs to the crew like a place, and
# the server makes sure the whole of it has sharp imagery, so a hand at one fence still sees the far one.
class Pasture < ApplicationRecord
  include Syncable

  belongs_to :ranch
  belongs_to :member

  # The phone thins the ride's track before saving it; this is room to spare for a long, crooked fence
  MAX_POINTS = 2_000

  validates :id, :name, presence: true
  validates :name, length: { maximum: 80 }
  validate :outline_is_a_ring

  after_commit :sharpen, on: %i[create update], if: -> { deleted_at.nil? && saved_change_to_outline? }

  def self.attributes_from_raw(raw)
    { name: raw["name"].to_s.strip.presence, outline: Ride.parse_track(raw["outline"]) }
  end

  def to_raw
    { id: id, member_id: member_id.to_s, name: name, outline: outline.to_json }
  end

  def bounds
    lngs, lats = outline.map { |point| point.first(2) }.transpose
    { west: lngs.min, south: lats.min, east: lngs.max, north: lats.max }
  end

  # Queues a sharp area over the pasture and its margin, unless one already covers it. Never raises: a ranch
  # at its area limit, or a pasture too big to sharpen, still keeps its pasture. RenderMapAreaJob calls this
  # again for the ranch's pastures when a render finishes, so one that had to wait gets its turn.
  def sharpen
    # Queried fresh, not through ranch.map_areas: a create that failed validation would sit in that loaded list
    # and count as covering the pasture on the next try
    return if deleted_at || MapArea.where(ranch_id: ranch_id).any? { |area| area.covers?(**bounds) }

    box = MapArea.padded(**bounds)
    area = ranch.with_lock { MapArea.create(ranch: ranch, name: name.first(60), source: MapArea.source_for(**box).key, **box) }
    RenderMapAreaJob.perform_later(area) if area.persisted?
  end

  private

  def outline_is_a_ring
    points = outline.is_a?(Array) && outline.all? { |p| p.is_a?(Array) && p.size >= 2 && p.first(2).all?(Numeric) }
    return errors.add(:outline, "must be a list of [longitude, latitude] points") unless points
    # Three corners and the closing point
    return errors.add(:outline, "needs at least 3 corners") if outline.uniq.size < 3
    errors.add(:outline, "has more than #{MAX_POINTS} points") if outline.size > MAX_POINTS
  end
end
