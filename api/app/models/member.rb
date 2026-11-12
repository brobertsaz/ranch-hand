class Member < ApplicationRecord
  belongs_to :ranch
  has_many :observations, dependent: :restrict_with_error
  has_many :waypoints, dependent: :restrict_with_error
  has_many :rides, dependent: :restrict_with_error

  has_secure_token :device_token

  enum :role, { owner: "owner", hand: "hand" }, validate: true

  NAME_LIMIT = 60
  # What the crew sees on the pins of a hand who deleted their account
  ERASED_NAME = "Former hand".freeze

  validates :name, presence: true, length: { maximum: NAME_LIMIT }
  validates :google_sub, uniqueness: true, allow_nil: true

  # Still on the crew. A removed member's row stays so their old pins and rides keep their name.
  scope :active, -> { where(removed_at: nil) }

  def removed? = removed_at?

  # Their token stops working (see Api::V1::BaseController) and their spot on the free plan opens up
  def remove!
    update!(removed_at: Time.current) unless removed?
  end

  # A hand deleting their account: removed, and no longer anyone in particular. What they logged belongs
  # to the ranch and stays; the next pull gives every other phone the new name.
  def erase!
    update!(name: ERASED_NAME, email: nil, google_sub: nil, removed_at: removed_at || Time.current)
  end

  # What a phone keeps after joining or signing in: its token, who it is, and which ranch
  def device_json
    { token: device_token, member_id: id.to_s, ranch: { id: ranch.id.to_s, name: ranch.name, headquarters: ranch.headquarters } }
  end

  # Read-only on the phone: names for "Jess logged this", never pushed back.
  # Every pull sends the whole crew, so a removal reaches the other phones on their next sync.
  def to_raw
    { id: id.to_s, name: name, role: role, removed: removed? }
  end
end
