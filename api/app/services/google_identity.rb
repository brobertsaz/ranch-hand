# Who a Google Sign-In ID token from the phone says the person is. The app asks Google for a token
# addressed to our web client ID (GOOGLE_CLIENT_ID), so that's the audience we check for.
class GoogleIdentity < Data.define(:sub, :email, :name)
  class Invalid < StandardError; end

  def self.verify(id_token)
    payload = Google::Auth::IDTokens.verify_oidc(id_token, aud: ENV.fetch("GOOGLE_CLIENT_ID"))
    raise Invalid, "email not verified" unless payload["email_verified"]

    new(sub: payload["sub"], email: payload["email"], name: payload["name"].presence || payload["email"].split("@").first)
  rescue Google::Auth::IDTokens::VerificationError => error
    raise Invalid, error.message
  end
end
