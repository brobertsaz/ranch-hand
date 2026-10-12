require "rails_helper"

RSpec.describe "Ranch", type: :request do
  it "tells a member their ranch's invite code" do
    member = create(:member, ranch: create(:ranch, name: "Bob's Ranch", invite_code: "BOBSRANCH"))

    get "/api/v1/ranch", headers: auth_headers(member)

    expect(response).to have_http_status(:ok)
    expect(json).to eq("id" => member.ranch_id.to_s, "name" => "Bob's Ranch", "invite_code" => "BOBSRANCH")
  end

  it "needs a device token" do
    get "/api/v1/ranch"

    expect(response).to have_http_status(:unauthorized)
  end
end
