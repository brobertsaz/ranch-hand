class Ranch < ApplicationRecord
  has_many :members, dependent: :destroy
  has_many :observations, dependent: :destroy
  has_many :photos, dependent: :destroy
  has_many :waypoints, dependent: :destroy

  validates :name, :invite_code, presence: true
  validates :invite_code, uniqueness: true
end
