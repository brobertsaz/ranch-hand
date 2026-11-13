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

  it "lets a fourth hand join a Pro ranch and a founding ranch" do
    create_list(:member, 3, ranch: ranch)

    ranch.update!(plan: :pro)
    post "/api/v1/devices", params: { invite_code: "BOBSRANCH", name: "Jess" }, as: :json
    expect(response).to have_http_status(:created)

    ranch.update!(plan: :founding)
    post "/api/v1/devices", params: { invite_code: "BOBSRANCH", name: "Cody" }, as: :json
    expect(response).to have_http_status(:created)
    expect(ranch.hand_count).to eq(5)
  end

  it "keeps the crew of a Pro ranch that stopped paying but takes no new hands" do
    create_list(:member, 5, ranch: ranch)
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
    create_list(:member, 2, ranch: ranch)
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

    it "won't let the owner leave" do
      owner = create(:member, ranch: ranch, role: :owner)

      delete "/api/v1/device", headers: auth_headers(owner)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json).to eq("error" => "owner")
      expect(owner.reload).not_to be_removed
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

    it "gets the plain map style, without the ranch's sharp areas" do
      create(:map_area, ranch: ranch, status: :ready)

      get "/api/v1/map/style", params: { token: removed.device_token }

      expect(response).to have_http_status(:ok)
      expect(json["sources"].keys).to eq(%w[imagery topo])
    end
  end
end
