class Member < ApplicationRecord
  belongs_to :ranch
  has_many :observations, dependent: :restrict_with_error
  has_many :waypoints, dependent: :restrict_with_error
  has_many :rides, dependent: :restrict_with_error

  has_secure_token :device_token

  enum :role, { owner: "owner", hand: "hand" }, validate: true

  validates :name, presence: true
  validates :google_sub, uniqueness: true, allow_nil: true

  # What a phone keeps after joining or signing in: its token, who it is, and which ranch
  def device_json
    { token: device_token, member_id: id.to_s, ranch: { id: ranch.id.to_s, name: ranch.name, headquarters: ranch.headquarters } }
  end

  # Read-only on the phone: names for "Jess logged this", never pushed back
  def to_raw
    { id: id.to_s, name: name, role: role }
  end
end
