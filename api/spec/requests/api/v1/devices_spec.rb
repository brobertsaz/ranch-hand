require "rails_helper"

RSpec.describe "Devices", type: :request do
  let!(:ranch) { create(:ranch, name: "Bob's Ranch", invite_code: "BOBSRANCH") }

  it "joins a ranch with its invite code and returns a device token" do
    post "/api/v1/devices", params: { invite_code: " bobsranch ", name: "Jess" }, as: :json

    expect(response).to have_http_status(:created)
    member = ranch.members.sole
    expect(json).to include("token" => member.device_token, "member_id" => member.id.to_s)
    expect(json["ranch"]).to eq("id" => ranch.id.to_s, "name" => "Bob's Ranch", "headquarters" => nil)
  end

  it "turns away a fourth hand on the free plan" do
    create(:member, ranch: ranch, role: :owner)
    create_list(:member, 3, ranch: ranch)

    post "/api/v1/devices", params: { invite_code: "BOBSRANCH", name: "Jess" }, as: :json

    expect(response).to have_http_status(:forbidden)
    expect(json).to eq("error" => "ranch_full", "hand_limit" => 3)
    expect(ranch.members.count).to eq(4)
  end

  it "rejects an unknown invite code" do
    post "/api/v1/devices", params: { invite_code: "NOPE", name: "Jess" }, as: :json

    expect(response).to have_http_status(:not_found)
    expect(Member.count).to eq(0)
  end
end
