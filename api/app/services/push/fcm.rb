require "net/http"

module Push
  # Android notifications through Firebase Cloud Messaging's HTTP v1 API.
  # FCM_SERVICE_ACCOUNT_JSON holds the Firebase project's service account key (the whole JSON file as text).
  class Fcm
    SCOPE = "https://www.googleapis.com/auth/firebase.messaging".freeze
    class << self
      def configured? = ENV["FCM_SERVICE_ACCOUNT_JSON"].present?

      def deliver(token, message)
        uri = URI("https://fcm.googleapis.com/v1/projects/#{project_id}/messages:send")
        response = Net::HTTP.post(uri, payload(token, message).to_json, "Authorization" => "Bearer #{access_token}", "Content-Type" => "application/json")
        return if response.is_a?(Net::HTTPSuccess)

        raise PushNotifier::TokenGone if gone?(response)
        raise "FCM HTTP #{response.code}: #{response.body.to_s.first(200)}"
      end

      def payload(token, message)
        {
          message: {
            token: token,
            # A notification message: Android shows it itself, even when the app isn't running
            notification: { title: message.title, body: message.body },
            # FCM data values must all be text
            data: message.data.transform_values(&:to_s),
            # "crew" is the channel the app makes (mobile/src/push.ts); Android falls back to its own if it's missing
            android: { priority: "high", notification: { channel_id: "crew" } }
          }
        }
      end

      private

      # 404 is a token FCM no longer knows (the app was removed). A 400 can also be our own bad payload,
      # so it only counts when FCM says it's the token.
      def gone?(response)
        response.is_a?(Net::HTTPNotFound) || (response.is_a?(Net::HTTPBadRequest) && response.body.to_s.include?("registration token"))
      end

      def key = JSON.parse(ENV.fetch("FCM_SERVICE_ACCOUNT_JSON"))

      def project_id = key.fetch("project_id")

      # googleauth caches the token and fetches a new one when it's about to run out
      def access_token
        LOCK.synchronize do
          @credentials ||= Google::Auth::ServiceAccountCredentials.make_creds(json_key_io: StringIO.new(key.to_json), scope: SCOPE)
          @credentials.fetch_access_token! if @credentials.needs_access_token?
          @credentials.access_token
        end
      end
    end

    LOCK = Mutex.new
  end
end
