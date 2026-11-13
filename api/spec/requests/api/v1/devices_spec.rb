require "rails_helper"

RSpec.describe "Devices", type: :request do
  let!(:ranch) { create(:ranch, name: "Bob's Ranch", invite_code: "BOBSRANCH") }

  it "joins a ranch with its invite code and returns a device token" do
    post "/api/v1/devices", params: { invite_code: " bobsranch ", name: "Jess" }, as: :json

    expect(response).to have_http_status(:created)
    member = ranch.members.sole
    expect(json).to include("token" => member.devices.sole.token, "member_id" => member.id.to_s)
    expect(json["ranch"]).to eq("id" => ranch.id.to_s, "name" => "Bob's Ranch", "headquarters" => nil, "map_key" => ranch.map_key)
  end

  it "turns away a fourth hand on the free plan" do
    create(:member, ranch: ranch, role: :owner)
    create_list(:member, 3, ranch: ranch, name: "Sam")

    post "/api/v1/devices", params: { invite_code: "BOBSRANCH", name: "Jess" }, as: :json

    expect(response).to have_http_status(:forbidden)
    expect(json).to eq("error" => "ranch_full", "hand_limit" => 3)
    expect(ranch.members.count).to eq(4)
  end

  it "lets a fourth hand join a Pro ranch and a founding ranch" do
    create_list(:member, 3, ranch: ranch, name: "Sam")

    ranch.update!(plan: :pro)
    post "/api/v1/devices", params: { invite_code: "BOBSRANCH", name: "Jess" }, as: :json
    expect(response).to have_http_status(:created)

    ranch.update!(plan: :founding)
    post "/api/v1/devices", params: { invite_code: "BOBSRANCH", name: "Cody" }, as: :json
    expect(response).to have_http_status(:created)
    expect(ranch.hand_count).to eq(5)
  end

  it "keeps the crew of a Pro ranch that stopped paying but takes no new hands" do
    create_list(:member, 5, ranch: ranch, name: "Sam")
    ranch.update!(plan: :pro, pro_until: 1.day.ago)

    post "/api/v1/devices", params: { invite_code: "BOBSRANCH", name: "Jess" }, as: :json

    expect(response).to have_http_status(:forbidden)
    expect(json).to include("error" => "ranch_full")
    expect(ranch.hand_count).to eq(5)
  end

  it "rejects an unknown invite code" do
    post "/api/v1/devices", params: { invite_code: "NOPE", name: "Jess" }, as: :json

    expect(response).to have_http_status(:not_found)
    expect(Member.count).to eq(0)
  end

  it "lets a new hand take the spot of one who left" do
    create_list(:member, 2, ranch: ranch, name: "Sam")
    create(:member, ranch: ranch, removed_at: 1.day.ago)

    post "/api/v1/devices", params: { invite_code: "BOBSRANCH", name: "Jess" }, as: :json

    expect(response).to have_http_status(:created)
    expect(ranch.reload).to be_full
  end

  it "rejects a name too long to show on a pin" do
    post "/api/v1/devices", params: { invite_code: "BOBSRANCH", name: "J" * 61 }, as: :json

    expect(response).to have_http_status(:unprocessable_content)
    expect(Member.count).to eq(0)
  end

  it "slows down someone guessing codes" do
    # The test environment's cache stores nothing, so the counter is kept here instead
    counter = ActiveSupport::Cache::MemoryStore.new
    allow(Api::V1::DevicesController.cache_store).to receive(:increment) { |*args, **options| counter.increment(*args, **options) }

    10.times do
      post "/api/v1/devices", params: { invite_code: "NOPE", name: "Jess" }, as: :json
      expect(response).to have_http_status(:not_found)
    end
    post "/api/v1/devices", params: { invite_code: "BOBSRANCH", name: "Jess" }, as: :json

    expect(response).to have_http_status(:too_many_requests)
    expect(Member.count).to eq(0)
  end

  it "keeps the invite code out of the logs" do
    filter = ActiveSupport::ParameterFilter.new(Rails.application.config.filter_parameters)

    expect(filter.filter("invite_code" => "BOBSRANCH", "name" => "Jess")).to eq("invite_code" => "[FILTERED]", "name" => "Jess")
  end

  describe "leaving the ranch" do
    it "removes the hand, frees their spot and keeps what they logged" do
      hand = create(:member, ranch: ranch, name: "Sam")
      observation = create(:observation, member: hand)

      delete "/api/v1/device", headers: auth_headers(hand)

      expect(response).to have_http_status(:no_content)
      expect(hand.reload).to be_removed
      expect(ranch.hand_count).to eq(0)
      expect(observation.reload).to have_attributes(member: hand, deleted_at: nil)
    end

    it "keeps the owner on the ranch and only signs that phone out" do
      owner = create(:member, ranch: ranch, role: :owner)
      other_phone = owner.sign_in!
      this_phone = owner.sign_in!

      delete "/api/v1/device", headers: { "Authorization" => "Bearer #{this_phone.token}" }

      expect(response).to have_http_status(:no_content)
      expect(owner.reload).not_to be_removed
      expect(owner.devices).to contain_exactly(other_phone)
    end

    it "needs a device token" do
      delete "/api/v1/device"

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "a removed member's token" do
    let(:removed) { create(:member, ranch: ranch, removed_at: 1.minute.ago) }

    it "gets a 401 that says so on every endpoint that needs a token" do
      photo = create(:photo, observation: create(:observation, member: removed))
      area = create(:map_area, ranch: ranch)
      requests = [
        [ :get, "/api/v1/sync" ], [ :post, "/api/v1/sync" ], [ :get, "/api/v1/ranch" ], [ :patch, "/api/v1/ranch" ],
        [ :post, "/api/v1/ranch/invite_code" ], [ :delete, "/api/v1/device" ], [ :delete, "/api/v1/members/#{removed.id}" ],
        [ :get, "/api/v1/photos/#{photo.id}/file" ], [ :put, "/api/v1/photos/#{photo.id}/file" ],
        [ :get, "/api/v1/map_areas" ], [ :get, "/api/v1/map_areas/new" ], [ :post, "/api/v1/map_areas" ], [ :delete, "/api/v1/map_areas/#{area.id}" ]
      ]

      requests.each do |verb, path|
        public_send(verb, path, headers: auth_headers(removed))

        expect(response).to have_http_status(:unauthorized), "#{verb} #{path} gave #{response.status}"
        expect(json).to eq("error" => "removed")
      end
    end

    it "is still a bare 401 for a token nobody has" do
      get "/api/v1/ranch", headers: { "Authorization" => "Bearer nobody" }

      expect(response).to have_http_status(:unauthorized)
      expect(response.body).to be_empty
    end

    it "can't get the ranch's sharp areas by putting its token in the map style URL" do
      create(:map_area, ranch: ranch, status: :ready)

      get "/api/v1/map/style", params: { token: device_of(removed).token }

      expect(response).to have_http_status(:ok)
      expect(json["sources"].keys).to eq(%w[imagery topo])
    end
  end

  describe "a hand who already joined, on a new phone or after a reinstall" do
    let!(:sam) { create(:member, ranch: ranch, name: "Sam Rowe") }
    let!(:old_phone) { sam.sign_in! }

    def join(name, **extra)
      post "/api/v1/devices", params: { invite_code: "BOBSRANCH", name: name, **extra }, as: :json
    end

    it "is asked whether that's them before anything changes" do
      join(" sam rowe ")

      expect(response).to have_http_status(:conflict)
      expect(json).to eq("error" => "name_taken", "name" => "Sam Rowe", "joined_at" => sam.created_at.iso8601)
      expect(ranch.members.count).to eq(1)
      expect(sam.devices.sole).to eq(old_phone)
    end

    it "gets their own spot back, with a new token, and the old phone is signed out" do
      old_phone.register_push!(platform: "android", token: "fcm-old")
      mine = create(:observation, member: sam)

      join("SAM ROWE", rejoin: true)

      expect(response).to have_http_status(:ok)
      expect(json).to include("member_id" => sam.id.to_s, "token" => sam.devices.sole.token)
      expect(json["token"]).not_to eq(old_phone.token)
      expect(ranch.members.count).to eq(1)
      expect(mine.reload.member).to eq(sam)

      get "/api/v1/ranch", headers: { "Authorization" => "Bearer #{old_phone.token}" }
      expect(response).to have_http_status(:unauthorized)
      expect(response.body).to be_empty
    end

    it "gets back in even when the ranch is full" do
      create_list(:member, 2, ranch: ranch, name: "Cody")

      join("Sam Rowe", rejoin: true)

      expect(response).to have_http_status(:ok)
      expect(ranch.hand_count).to eq(3)
    end

    it "joins as a second hand of the same name when they say it isn't them" do
      join("Sam Rowe", rejoin: false)

      expect(response).to have_http_status(:created)
      expect(ranch.members.named("Sam Rowe").count).to eq(2)
      expect(sam.devices.sole).to eq(old_phone)
    end

    it "doesn't match a hand who was removed, or the owner" do
      sam.remove!
      create(:member, ranch: ranch, role: :owner, name: "Bob")

      join("Sam Rowe")
      expect(response).to have_http_status(:created)

      join("Bob")
      expect(response).to have_http_status(:created)
      expect(ranch.members.owner.sole.devices).to be_empty
    end
  end
end
