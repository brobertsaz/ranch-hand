require "rails_helper"

RSpec.describe AppleIdentity do
  let(:payload) { { "sub" => "apple-456", "email" => "bob@example.com" } }
  let(:verifier) { instance_double(Google::Auth::IDTokens::Verifier, verify: payload) }

  before do
    stub_const("ENV", ENV.to_h.merge("APPLE_BUNDLE_ID" => "com.example.ranch"))
    allow(described_class).to receive(:verifier).and_return(verifier)
  end

  it "says who a token addressed to our bundle ID belongs to, with the name the app passed along" do
    expect(described_class.verify("good-token", name: " Bob Roberts ")).to have_attributes(sub: "apple-456", email: "bob@example.com", name: "Bob Roberts")
    expect(verifier).to have_received(:verify).with("good-token", aud: "com.example.ranch")
  end

  it "falls back to the start of the email, then to a plain word, when Apple gives no name" do
    expect(described_class.verify("good-token").name).to eq("bob")

    payload.delete("email")
    expect(described_class.verify("good-token")).to have_attributes(name: "Owner", email: nil)
  end

  it "refuses a token the library rejects: forged, expired, or meant for another app" do
    [ Google::Auth::IDTokens::SignatureError, Google::Auth::IDTokens::ExpiredTokenError, Google::Auth::IDTokens::AudienceMismatchError ].each do |error|
      allow(verifier).to receive(:verify).and_raise(error, "nope")

      expect { described_class.verify("bad-token") }.to raise_error(described_class::Invalid, "nope")
    end
  end

  describe "with a real signed token" do
    let(:key) { OpenSSL::PKey::RSA.generate(2048) }
    let(:claims) { { iss: "https://appleid.apple.com", aud: "com.example.ranch", sub: "apple-456", email: "bob@example.com", exp: 1.hour.from_now.to_i } }

    def token(signed_by: key, **overrides)
      JWT.encode(claims.merge(overrides), signed_by, "RS256", kid: "key1")
    end

    before do
      apples_keys = Google::Auth::IDTokens::StaticKeySource.new(Google::Auth::IDTokens::KeyInfo.new(id: "key1", key: key.public_key, algorithm: "RS256"))
      allow(Google::Auth::IDTokens::JwkHttpKeySource).to receive(:new).with("https://appleid.apple.com/auth/keys").and_return(apples_keys)
      described_class.instance_variable_set(:@verifier, nil)
      allow(described_class).to receive(:verifier).and_call_original
    end

    after { described_class.instance_variable_set(:@verifier, nil) }

    it "accepts one Apple signed for this app" do
      expect(described_class.verify(token)).to have_attributes(sub: "apple-456", email: "bob@example.com")
    end

    it "refuses one for another app, from another issuer, signed by someone else, or expired" do
      [ token(aud: "com.other.app"), token(iss: "https://accounts.google.com"), token(signed_by: OpenSSL::PKey::RSA.generate(2048)), token(exp: 1.hour.ago.to_i) ].each do |bad|
        expect { described_class.verify(bad) }.to raise_error(described_class::Invalid)
      end
    end
  end
end
