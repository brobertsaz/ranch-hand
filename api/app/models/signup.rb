# A ranch on the early-access list, from the landing page's form
class Signup < ApplicationRecord
  HEAD_COUNTS = %w[under-100 100-499 500-1999 2000+].freeze
  RIDES = %w[horse 4x4 both].freeze

  normalizes :email, with: ->(email) { email.strip.downcase }
  normalizes :name, :state, with: ->(value) { value.strip }

  validates :name, presence: true, length: { maximum: 100 }
  validates :email, presence: true, length: { maximum: 254 }, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :state, length: { maximum: 50 }
  validates :head_count, inclusion: { in: HEAD_COUNTS }, allow_blank: true
  validates :rides, inclusion: { in: RIDES }, allow_blank: true
end
