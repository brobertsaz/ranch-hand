class Ranch < ApplicationRecord
  # Children before what they point at, so destroying a ranch works: members go last because they
  # refuse to be destroyed while anything they logged is still there
  has_many :photos, dependent: :destroy
  has_many :observations, dependent: :destroy
  has_many :rides, dependent: :destroy
  has_many :waypoints, dependent: :destroy
  has_many :map_areas, dependent: :destroy
  has_many :members, dependent: :destroy

  # No 0/O or 1/I, so a code read over the phone or off a whiteboard comes through right
  INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".chars.freeze
  # How many miles across the owner can have sharpened around headquarters; 3 is preselected
  HEADQUARTERS_MILES = [ 1, 3, 5 ].freeze

  # free: up to hand_limit hands. pro: paid for, any number of hands while it's paid up.
  # founding: the first ranches, any number of hands for good.
  enum :plan, { free: "free", pro: "pro", founding: "founding" }, validate: true

  # What the app puts in the map style URL to get this ranch's sharp areas (see MapStylesController)
  has_secure_token :map_key

  before_validation :assign_invite_code, on: :create

  validates :name, :invite_code, presence: true
  validates :name, length: { maximum: 100 }
  validates :invite_code, uniqueness: true
  validates :hq_lat, numericality: { in: -85..85 }, allow_nil: true
  validates :hq_lng, numericality: { in: -180..180 }, allow_nil: true

  # The free plan's cap counts hands only; the owner doesn't take a spot, and neither does a hand who left
  def full? = !unlimited_hands? && hand_count >= hand_limit

  # A Pro ranch that stopped paying keeps its whole crew; it just can't add hands past the free cap until it pays again
  def unlimited_hands? = founding? || (pro? && (pro_until.nil? || pro_until.future?))

  def hand_count = members.hand.active.count

  # The old code stops working, for when it got out or a hand was let go
  def regenerate_invite_code!
    update!(invite_code: fresh_invite_code)
    invite_code
  end

  def headquarters = hq_lat && { lat: hq_lat, lng: hq_lng }

  # Moves the pin, and sharpens that many miles around it unless one working area already covers all of it.
  # Returns the new area, if any.
  def place_headquarters!(lat:, lng:, miles: 3)
    raise ArgumentError, "miles must be one of #{HEADQUARTERS_MILES.join(", ")}" unless HEADQUARTERS_MILES.include?(miles)

    box = MapArea.around(lng:, lat:, miles:)
    # The lock keeps two requests from both slipping under the ranch's area limits (see MapArea)
    area = with_lock do
      update!(hq_lat: lat, hq_lng: lng)
      # Every area carries MapArea::MARGIN_METERS of slack, so a pin nudged a few yards doesn't render it all again
      inner = MapArea.around(lng:, lat:, miles: miles - (2 * MapArea::MARGIN_METERS / MapArea::METERS_PER_MILE))
      unless map_areas.where.not(status: :failed).any? { |existing| existing.covers?(**inner) }
        map_areas.create!(name: "Headquarters", source: MapArea.source_for(**box).key, **box)
      end
    end
    RenderMapAreaJob.perform_later(area) if area
    area
  end

  # The owner deleting their account: the ranch goes, for everyone on it. The rows go in one transaction,
  # by SQL rather than record by record (a season of pins and tracks would take minutes to load and destroy).
  # The lock makes a push that is mid-flight finish first and any later one fail, instead of slipping a row
  # in behind the deletes. Photo files and sharp tiles are cleared afterwards, in the background.
  #
  # shortcut: if the process stops between the commit and those jobs, the files stay in storage with nothing
  # pointing at them. Sweep unattached blobs on a schedule once there are enough ranches for that to add up.
  def erase!
    photo_blobs = areas = nil
    with_lock do
      attachments = ActiveStorage::Attachment.where(record_type: "Photo", record_id: photos.select(:id))
      photo_blobs = ActiveStorage::Blob.where(id: attachments.select(:blob_id)).to_a
      areas = map_areas.map { |area| [ area.source, area.bounds ] }

      attachments.delete_all
      # In the order the foreign keys allow: photos, then what they hang off, members last
      Device.where(member_id: members.select(:id)).delete_all
      [ Photo, Observation, Ride, Waypoint, MapArea, Member ].each { |model| model.where(ranch_id: id).delete_all }
      delete
    end
    photo_blobs.each(&:purge_later)
    # Tiles a neighbor's area still covers are left (see RemoveMapAreaTilesJob)
    areas.each { |source, bounds| RemoveMapAreaTilesJob.perform_later(source, bounds) }
    self
  end

  private

  def assign_invite_code
    self.invite_code ||= fresh_invite_code
  end

  def fresh_invite_code
    loop do
      code = Array.new(6) { INVITE_ALPHABET.sample(random: SecureRandom) }.join
      break code unless Ranch.exists?(invite_code: code)
    end
  end
end
