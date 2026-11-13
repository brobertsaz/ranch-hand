require "rails_helper"

RSpec.describe "Push tokens", type: :request do
  let(:member) { create(:member) }

  def register(token, platform: "android", as: member)
    put "/api/v1/push_token", params: { platform: platform, token: token }, headers: auth_headers(as), as: :json
  end

  it "requires a device token" do
    put "/api/v1/push_token", params: { platform: "android", token: "fcm-1" }, as: :json

    expect(response).to have_http_status(:unauthorized)
  end

  it "remembers where this phone's notifications go, and the newest token wins" do
    register("fcm-1")
    register("apns-2", platform: "ios")

    expect(response).to have_http_status(:no_content)
    expect(member.reload).to have_attributes(push_platform: "ios", push_token: "apns-2")
  end

  it "moves a token to whoever is signed in on that phone now" do
    previous = create(:member, push_platform: "android", push_token: "fcm-1")

    register("fcm-1")

    expect(previous.reload.push_token).to be_nil
    expect(member.reload.push_token).to eq("fcm-1")
  end

  it "turns away a platform it can't send to, and a token too long to be one" do
    register("token", platform: "windows")
    expect(response).to have_http_status(:unprocessable_content)

    register("x" * 5000)
    expect(response).to have_http_status(:unprocessable_content)
    expect(member.reload.push_token).to be_nil
  end

  it "forgets the token when notifications are turned off" do
    member.register_push!(platform: "android", token: "fcm-1")

    delete "/api/v1/push_token", headers: auth_headers(member)

    expect(response).to have_http_status(:no_content)
    expect(member.reload).to have_attributes(push_platform: nil, push_token: nil)
  end
end
