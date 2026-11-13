# A phone signed in as a member. Its token is what the app sends with every request; a hand has one phone,
# an owner can have several (see Member#sign_in!).
class Device < ApplicationRecord
  belongs_to :member

  has_secure_token :token

  validates :push_platform, inclusion: { in: PushNotifier::PLATFORMS }, allow_nil: true

  scope :with_push, -> { where.not(push_token: nil) }

  # How stale last_seen_at may get: it only decides which of an owner's phones is the oldest
  SEEN_EVERY = 1.day

  def seen!
    update_column(:last_seen_at, Time.current) if last_seen_at.nil? || last_seen_at < SEEN_EVERY.ago
  end

  def register_push!(platform:, token:)
    transaction do
      # A phone handed from one hand to the next keeps its push token; it now belongs to whoever is signed in
      Device.where(push_token: token).where.not(id: id).update_all(push_token: nil, push_platform: nil)
      update!(push_platform: platform, push_token: token)
    end
  end

  def forget_push!
    update!(push_token: nil, push_platform: nil)
  end
end
