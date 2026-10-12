require "rails_helper"

RSpec.describe "Devices", type: :request do
  let!(:ranch) { create(:ranch, name: "Bob's Ranch", invite_code: "BOBSRANCH") }

  it "joins a ranch with its invite code and returns a device token" do
    post "/api/v1/devices", params: { invite_code: " bobsranch ", name: "Jess" }, as: :json

    expect(response).to have_http_status(:created)
    member = ranch.members.sole
    expect(json).to include("token" => member.device_token, "member_id" => member.id.to_s)
    expect(json["ranch"]).to eq("id" => ranch.id.to_s, "name" => "Bob's Ranch")
  end

  it "rejects an unknown invite code" do
    post "/api/v1/devices", params: { invite_code: "NOPE", name: "Jess" }, as: :json

    expect(response).to have_http_status(:not_found)
    expect(Member.count).to eq(0)
  end
end
