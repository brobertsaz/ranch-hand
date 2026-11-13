module Push
  # iPhone notifications through Apple's push service, signed with a .p8 key from the Apple developer account.
  # APNS_KEY is the key file's text, APNS_KEY_ID and APNS_TEAM_ID name it, and APNS_TOPIC is the app's bundle ID.
  # Builds signed for development (Xcode, a dev build) only take pushes from Apple's sandbox: set APNS_SANDBOX=1.
  #
  # Not yet run against Apple: push needs a paid developer account, which the project doesn't have yet.
  class Apns
    # Apple's reasons for a token that will never work again
    GONE = %w[BadDeviceToken Unregistered DeviceTokenNotForTopic].freeze

    class << self
      def configured? = %w[APNS_KEY APNS_KEY_ID APNS_TEAM_ID].all? { |name| ENV[name].present? }

      def deliver(token, message)
        response = connection.push(notification(token, message), timeout: 15)
        raise "APNs didn't answer" unless response
        return if response.ok?

        raise PushNotifier::TokenGone if response.status == "410" || GONE.include?(response.body["reason"])
        raise "APNs HTTP #{response.status}: #{response.body["reason"]}"
      end

      def notification(token, message)
        Apnotic::Notification.new(token).tap do |notification|
          notification.topic = ENV.fetch("APNS_TOPIC", "dev.ranchhand.spike")
          notification.alert = { title: message.title, body: message.body }
          notification.sound = "default"
          notification.custom_payload = message.data
        end
      end

      private

      # shortcut: a new connection per notification, upgrade to a kept-open one (Apnotic::ConnectionPool) when
      # a crew is big enough for the handshakes to add up
      def connection
        options = { auth_method: :token, cert_path: StringIO.new(ENV.fetch("APNS_KEY")), key_id: ENV.fetch("APNS_KEY_ID"), team_id: ENV.fetch("APNS_TEAM_ID") }
        ENV["APNS_SANDBOX"].present? ? Apnotic::Connection.development(options) : Apnotic::Connection.new(options)
      end
    end
  end
end
