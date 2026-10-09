class Member < ApplicationRecord
  belongs_to :ranch
  has_many :observations, dependent: :restrict_with_error
  has_many :waypoints, dependent: :restrict_with_error

  has_secure_token :device_token

  enum :role, { owner: "owner", hand: "hand" }, validate: true

  validates :name, presence: true
end
