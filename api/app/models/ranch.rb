class Ranch < ApplicationRecord
  has_many :members, dependent: :destroy
  has_many :observations, dependent: :destroy
  has_many :photos, dependent: :destroy
  has_many :waypoints, dependent: :destroy
  has_many :rides, dependent: :destroy
  has_many :map_areas, dependent: :destroy

  # No 0/O or 1/I, so a code read over the phone or off a whiteboard comes through right
  INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".chars.freeze

  before_validation :assign_invite_code, on: :create

  validates :name, :invite_code, presence: true
  validates :name, length: { maximum: 100 }
  validates :invite_code, uniqueness: true

  # The free plan's cap counts hands only; the owner doesn't take a spot
  def full? = members.hand.count >= hand_limit

  private

  def assign_invite_code
    self.invite_code ||= loop do
      code = Array.new(6) { INVITE_ALPHABET.sample(random: SecureRandom) }.join
      break code unless Ranch.exists?(invite_code: code)
    end
  end
end
