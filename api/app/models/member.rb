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
  validates :google_sub, :apple_sub, uniqueness: true, allow_nil: true
  validates :push_platform, inclusion: { in: PushNotifier::PLATFORMS }, allow_nil: true

  # Still on the crew. A removed member's row stays so their old pins and rides keep their name.
  scope :active, -> { where(removed_at: nil) }

  def removed? = removed_at?

  # Their token stops working (see Api::V1::BaseController) and their spot on the free plan opens up
  # and what they said they'd see to goes back to the crew, and their phone stops getting the crew's news.
  def remove!
    return if removed?

    transaction do
      Observation.release_claims_of(self)
      update!(removed_at: Time.current, push_token: nil, push_platform: nil)
    end
  end

  # A hand deleting their account: removed, and no longer anyone in particular. What they logged belongs
  # to the ranch and stays; the next pull gives every other phone the new name.
  def erase!
    transaction do
      Observation.release_claims_of(self)
      update!(
        name: ERASED_NAME, email: nil, google_sub: nil, apple_sub: nil, push_token: nil, push_platform: nil,
        removed_at: removed_at || Time.current
      )
    end
  end

  # One phone per member gets the crew's news.
  # shortcut: an owner signed in on two phones shares one member, so only the phone that registered last is
  # notified, upgrade to a push_devices table when owners ask for it on both
  def register_push!(platform:, token:)
    transaction do
      # A phone handed from one hand to the next keeps its token; it now belongs to whoever is signed in
      Member.where(push_token: token).where.not(id: id).update_all(push_token: nil, push_platform: nil)
      update!(push_platform: platform, push_token: token)
    end
  end

  def forget_push!
    update!(push_token: nil, push_platform: nil)
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
