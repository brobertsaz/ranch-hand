require "rails_helper"

RSpec.describe "Owners", type: :request do
  let(:payload) { { "sub" => "google-123", "email" => "bob@example.com", "email_verified" => true, "name" => "Bob Roberts" } }

  before do
    stub_const("ENV", ENV.to_h.merge("GOOGLE_CLIENT_ID" => "web-client"))
    allow(Google::Auth::IDTokens).to receive(:verify_oidc).with("good-token", aud: "web-client").and_return(payload)
  end

  it "starts a ranch for a new owner" do
    post "/api/v1/owners", params: { id_token: "good-token", ranch_name: " Bar T " }, as: :json

    expect(response).to have_http_status(:created)
    owner = Member.sole
    expect(owner).to have_attributes(role: "owner", name: "Bob Roberts", email: "bob@example.com", google_sub: "google-123")
    expect(owner.ranch).to have_attributes(name: "Bar T", hand_limit: 3)
    expect(owner.ranch.invite_code).to match(/\A[A-Z2-9]{6}\z/)
    expect(json).to eq("token" => owner.device_token, "member_id" => owner.id.to_s, "ranch" => { "id" => owner.ranch_id.to_s, "name" => "Bar T", "headquarters" => nil })
  end

  it "names the ranch after the owner when they leave it blank" do
    post "/api/v1/owners", params: { id_token: "good-token" }, as: :json

    expect(Ranch.sole.name).to eq("Bob's Ranch")
  end

  it "signs a returning owner back in to the same ranch" do
    owner = create(:member, role: :owner, google_sub: "google-123")

    post "/api/v1/owners", params: { id_token: "good-token", ranch_name: "Another" }, as: :json

    expect(response).to have_http_status(:ok)
    expect(json["token"]).to eq(owner.device_token)
    expect(Ranch.count).to eq(1)
  end

  it "rejects an email Google hasn't verified" do
    payload["email_verified"] = false

    post "/api/v1/owners", params: { id_token: "good-token" }, as: :json

    expect(response).to have_http_status(:unauthorized)
    expect(Ranch.count).to eq(0)
  end

  it "rejects a token Google didn't sign" do
    allow(Google::Auth::IDTokens).to receive(:verify_oidc).with("forged", aud: "web-client")
      .and_raise(Google::Auth::IDTokens::SignatureError)

    post "/api/v1/owners", params: { id_token: "forged" }, as: :json

    expect(response).to have_http_status(:unauthorized)
  end
end
