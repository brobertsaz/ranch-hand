# Tells the rest of the crew's phones what a hand just logged, so the handoff doesn't wait for someone to
# open the app. Each phone registers its own FCM (Android) or APNs (iPhone) token; see Member#register_push!.
class PushNotifier
  PLATFORMS = %w[android ios].freeze
  SENDERS = { "android" => Push::Fcm, "ios" => Push::Apns }.freeze

  # The phone's token is no good any more (the app was removed, or the token rotated), so stop sending to it
  class TokenGone < StandardError; end

  Message = Data.define(:title, :body, :data)

  # observations: what `author` just pushed, all new and open
  def self.logged(author:, observations:)
    return if observations.empty?

    new(author.ranch).deliver(message_for(author, observations), except: author)
  end

  def self.message_for(author, observations)
    if observations.one?
      observation = observations.first
      Message.new(title: "#{observation.headline} · #{author.name}", body: observation.note.presence || "Open on #{author.ranch.name}",
                  data: { observation_id: observation.id })
    else
      Message.new(title: "#{author.name} logged #{observations.size} things", body: observations.map(&:headline).uniq.first(4).join(", "), data: {})
    end
  end

  def initialize(ranch)
    @ranch = ranch
  end

  def deliver(message, except: nil)
    recipients = @ranch.members.active.where.not(push_token: nil).where.not(id: except&.id)
    recipients.find_each do |member|
      sender = SENDERS.fetch(member.push_platform)
      # Not set up on this server (no Firebase or Apple key yet): nothing to send with
      next unless sender.configured?

      sender.deliver(member.push_token, message)
    rescue TokenGone
      member.forget_push!
    rescue StandardError => error
      # One phone's trouble (a timeout, a bad key) doesn't keep the rest of the crew from hearing
      Rails.error.report(error, handled: true, context: { member_id: member.id, platform: member.push_platform })
    end
  end
end
