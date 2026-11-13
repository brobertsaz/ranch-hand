require "rails_helper"

RSpec.describe GoogleIdentity do
  let(:payload) { { "sub" => "google-123", "email" => "bob@example.com", "email_verified" => true, "name" => "Bob Roberts" } }

  before do
    stub_const("ENV", ENV.to_h.merge("GOOGLE_CLIENT_ID" => "web-client"))
    allow(Google::Auth::IDTokens).to receive(:verify_oidc).and_return(payload)
  end

  it "says who a token addressed to our client ID belongs to" do
    expect(described_class.verify("good-token")).to have_attributes(sub: "google-123", email: "bob@example.com", name: "Bob Roberts")
    expect(Google::Auth::IDTokens).to have_received(:verify_oidc).with("good-token", aud: "web-client")
  end

  it "falls back to the start of the email for someone with no name" do
    payload["name"] = ""

    expect(described_class.verify("good-token").name).to eq("bob")
  end

  it "refuses an email Google hasn't verified" do
    payload.delete("email_verified")

    expect { described_class.verify("good-token") }.to raise_error(described_class::Invalid, "email not verified")
  end

  it "refuses a token Google's library rejects: forged, expired, or meant for another app" do
    [ Google::Auth::IDTokens::SignatureError, Google::Auth::IDTokens::ExpiredTokenError, Google::Auth::IDTokens::AudienceMismatchError ].each do |error|
      allow(Google::Auth::IDTokens).to receive(:verify_oidc).and_raise(error, "nope")

      expect { described_class.verify("bad-token") }.to raise_error(described_class::Invalid, "nope")
    end
  end
end
