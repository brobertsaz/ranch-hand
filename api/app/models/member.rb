class Member < ApplicationRecord
  belongs_to :ranch
  has_many :observations, dependent: :restrict_with_error
  has_many :waypoints, dependent: :restrict_with_error
  has_many :rides, dependent: :restrict_with_error

  has_secure_token :device_token

  enum :role, { owner: "owner", hand: "hand" }, validate: true

  validates :name, presence: true

  # Read-only on the phone: names for "Jess logged this", never pushed back
  def to_raw
    { id: id.to_s, name: name, role: role }
  end
end
