class Member < ApplicationRecord
  belongs_to :ranch
  has_many :observations, dependent: :restrict_with_error
  has_many :waypoints, dependent: :restrict_with_error
  has_many :rides, dependent: :restrict_with_error
  has_many :devices, dependent: :delete_all

  enum :role, { owner: "owner", hand: "hand" }, validate: true

  NAME_LIMIT = 60
  # What the crew sees on the pins of a hand who deleted their account
  ERASED_NAME = "Former hand".freeze

  validates :name, presence: true, length: { maximum: NAME_LIMIT }
  validates :google_sub, :apple_sub, uniqueness: true, allow_nil: true

  # Still on the crew. A removed member's row stays so their old pins and rides keep their name.
  scope :active, -> { where(removed_at: nil) }
  # How a hand on a new phone is matched to who they already are: by name, whatever the capitals or spaces
  scope :named, ->(name) { where("LOWER(TRIM(name)) = ?", name.to_s.strip.downcase) }

  # An owner's phones, each with its own token. Past this many the one seen longest ago is signed out.
  DEVICE_LIMIT = 5

  def removed? = removed_at?

  # Their token stops working (see Api::V1::BaseController) and their spot on the free plan opens up
  # and what they said they'd see to goes back to the crew, and their phone stops getting the crew's news.
  def remove!
    return if removed?

    transaction do
      Observation.release_claims_of(self)
      forget_push!
      update!(removed_at: Time.current)
    end
  end

  # A hand deleting their account: removed, and no longer anyone in particular. What they logged belongs
  # to the ranch and stays; the next pull gives every other phone the new name.
  def erase!
    transaction do
      Observation.release_claims_of(self)
      forget_push!
      update!(name: ERASED_NAME, email: nil, google_sub: nil, apple_sub: nil, removed_at: removed_at || Time.current)
    end
  end

  # A phone signing in as this member gets a token of its own. `only: true` is a hand on a new phone or a
  # reinstall: they have one phone, so the old one is signed out.
  def sign_in!(only: false)
    transaction do
      devices.delete_all if only
      device = devices.create!(last_seen_at: Time.current)
      devices.where.not(id: devices.order(Arel.sql("COALESCE(last_seen_at, created_at) DESC"), id: :desc).limit(DEVICE_LIMIT)).delete_all
      device
    end
  end

  # The phones stay signed in (a removed hand's still gets told it was removed) but hear no more of the crew's news
  def forget_push!
    devices.update_all(push_token: nil, push_platform: nil)
  end

  # What a phone keeps after joining or signing in: its token, who it is, and which ranch
  def device_json(device)
    {
      token: device.token, member_id: id.to_s,
      ranch: { id: ranch.id.to_s, name: ranch.name, headquarters: ranch.headquarters, map_key: ranch.map_key }
    }
  end

  # Read-only on the phone: names for "Jess logged this", never pushed back.
  # Every pull sends the whole crew, so a removal reaches the other phones on their next sync.
  def to_raw
    { id: id.to_s, name: name, role: role, removed: removed? }
  end
end
