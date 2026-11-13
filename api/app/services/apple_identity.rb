# Who a Sign in with Apple identity token from the iPhone says the person is. Apple addresses the token to the
# app's bundle ID (APPLE_BUNDLE_ID), so that's the audience we check for.
#
# Apple only tells the app the person's name, and only the first time they sign in, so the app passes it along;
# the token itself carries the email (or Apple's private relay address when they chose to hide it).
class AppleIdentity < Data.define(:sub, :email, :name)
  class Invalid < StandardError; end

  ISSUER = "https://appleid.apple.com".freeze
  KEYS_URL = "https://appleid.apple.com/auth/keys".freeze
  FALLBACK_NAME = "Owner".freeze

  def self.verify(identity_token, name: nil)
    payload = verifier.verify(identity_token, aud: ENV.fetch("APPLE_BUNDLE_ID", "dev.ranchhand.spike"))
    email = payload["email"].presence

    new(sub: payload["sub"], email: email, name: name.to_s.strip.presence || email&.split("@")&.first || FALLBACK_NAME)
  rescue Google::Auth::IDTokens::VerificationError => error
    raise Invalid, error.message
  end

  # googleauth's verifier isn't Google-only: it checks any JWT against a JWK set, and caches the keys
  def self.verifier
    @verifier ||= Google::Auth::IDTokens::Verifier.new(key_source: Google::Auth::IDTokens::JwkHttpKeySource.new(KEYS_URL), iss: ISSUER)
  end
end
