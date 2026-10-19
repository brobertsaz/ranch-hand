class Ranch < ApplicationRecord
  has_many :members, dependent: :destroy
  has_many :observations, dependent: :destroy
  has_many :photos, dependent: :destroy
  has_many :waypoints, dependent: :destroy
  has_many :rides, dependent: :destroy
  has_many :map_areas, dependent: :destroy

  # No 0/O or 1/I, so a code read over the phone or off a whiteboard comes through right
  INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".chars.freeze
  # Headquarters gets sharp imagery about a mile across (this far each way), before MapArea's own margin
  HEADQUARTERS_REACH_METERS = 800

  before_validation :assign_invite_code, on: :create

  validates :name, :invite_code, presence: true
  validates :name, length: { maximum: 100 }
  validates :invite_code, uniqueness: true
  validates :hq_lat, numericality: { in: -85..85 }, allow_nil: true
  validates :hq_lng, numericality: { in: -180..180 }, allow_nil: true

  # The free plan's cap counts hands only; the owner doesn't take a spot
  def full? = members.hand.count >= hand_limit

  def headquarters = hq_lat && { lat: hq_lat, lng: hq_lng }

  # Moves the pin, and sharpens around it unless an area already covers it. Returns the new area, if any.
  def place_headquarters!(lat:, lng:)
    area = transaction do
      update!(hq_lat: lat, hq_lng: lng)
      sharpen_headquarters unless map_areas.where.not(status: :failed).any? { |existing| existing.covers?(lng:, lat:) }
    end
    RenderMapAreaJob.perform_later(area) if area
    area
  end

  private

  def sharpen_headquarters
    box = MapArea.padded(west: hq_lng, south: hq_lat, east: hq_lng, north: hq_lat, margin: HEADQUARTERS_REACH_METERS + MapArea::MARGIN_METERS)
    map_areas.create!(name: "Headquarters", source: MapArea.source_for(**box).key, **box)
  end

  def assign_invite_code
    self.invite_code ||= loop do
      code = Array.new(6) { INVITE_ALPHABET.sample(random: SecureRandom) }.join
      break code unless Ranch.exists?(invite_code: code)
    end
  end
end
