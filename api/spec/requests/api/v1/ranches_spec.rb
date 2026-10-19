require "rails_helper"

RSpec.describe "Ranch", type: :request do
  include ActiveJob::TestHelper

  it "tells a member their ranch's invite code and how many hands it has room for" do
    member = create(:member, ranch: create(:ranch, name: "Bob's Ranch", invite_code: "BOBSRANCH"))
    create(:member, ranch: member.ranch, role: :owner)

    get "/api/v1/ranch", headers: auth_headers(member)

    expect(response).to have_http_status(:ok)
    expect(json).to eq(
      "id" => member.ranch_id.to_s, "name" => "Bob's Ranch", "invite_code" => "BOBSRANCH",
      "hand_count" => 1, "hand_limit" => 3, "headquarters" => nil
    )
  end

  it "needs a device token" do
    get "/api/v1/ranch"

    expect(response).to have_http_status(:unauthorized)
  end

  describe "setting headquarters" do
    let(:owner) { create(:member, role: :owner) }
    let(:ranch) { owner.ranch }

    it "pins it and sharpens 3 miles across around it" do
      expect {
        patch "/api/v1/ranch", params: { headquarters: { lat: 43.0, lng: -89.4 } }, headers: auth_headers(owner), as: :json
      }.to have_enqueued_job(RenderMapAreaJob)

      expect(response).to have_http_status(:ok)
      expect(json["headquarters"]).to eq("lat" => 43.0, "lng" => -89.4)
      area = ranch.map_areas.sole
      expect(json["map_area_id"]).to eq(area.id.to_s)
      expect(area).to have_attributes(name: "Headquarters", source: "wi-dnr-leaf-off")
      expect(area.covers?(west: -89.4, south: 43.0, east: -89.4, north: 43.0)).to be(true)
      expect((area.north - area.south) * MapArea::METERS_PER_DEGREE).to be_within(10).of(3 * MapArea::METERS_PER_MILE)
    end

    it "sharpens 5 miles across when the owner picks it" do
      patch "/api/v1/ranch", params: { headquarters: { lat: 43.0, lng: -89.4, miles: 5 } }, headers: auth_headers(owner), as: :json

      area = ranch.map_areas.sole
      expect((area.north - area.south) * MapArea::METERS_PER_DEGREE).to be_within(10).of(5 * MapArea::METERS_PER_MILE)
    end

    it "doesn't sharpen again when the pin moves a few yards" do
      patch "/api/v1/ranch", params: { headquarters: { lat: 43.0, lng: -89.4 } }, headers: auth_headers(owner), as: :json

      expect {
        patch "/api/v1/ranch", params: { headquarters: { lat: 43.00007, lng: -89.40008 } }, headers: auth_headers(owner), as: :json
      }.not_to have_enqueued_job(RenderMapAreaJob)
      expect(ranch.map_areas.count).to eq(1)
    end

    it "sharpens again when the owner picks a bigger square" do
      patch "/api/v1/ranch", params: { headquarters: { lat: 43.0, lng: -89.4, miles: 3 } }, headers: auth_headers(owner), as: :json
      patch "/api/v1/ranch", params: { headquarters: { lat: 43.0, lng: -89.4, miles: 5 } }, headers: auth_headers(owner), as: :json

      expect(ranch.map_areas.count).to eq(2)
    end

    it "still sharpens when an existing area covers the pin but not the whole box" do
      create(:map_area, ranch:, west: -89.41, south: 42.99, east: -89.39, north: 43.01)

      patch "/api/v1/ranch", params: { headquarters: { lat: 43.0, lng: -89.4 } }, headers: auth_headers(owner), as: :json

      expect(ranch.map_areas.where(name: "Headquarters")).to exist
    end

    it "doesn't sharpen again when an area already covers the whole box" do
      create(:map_area, ranch:, west: -89.5, south: 42.9, east: -89.3, north: 43.1)

      expect {
        patch "/api/v1/ranch", params: { headquarters: { lat: 43.0, lng: -89.4 } }, headers: auth_headers(owner), as: :json
      }.not_to have_enqueued_job(RenderMapAreaJob)

      expect(json["map_area_id"]).to be_nil
      expect(ranch.reload.headquarters).to eq(lat: 43.0, lng: -89.4)
    end

    it "sharpens again when the area that covers it failed to render" do
      create(:map_area, ranch:, west: -89.5, south: 42.9, east: -89.3, north: 43.1, status: :failed)

      patch "/api/v1/ranch", params: { headquarters: { lat: 43.0, lng: -89.4 } }, headers: auth_headers(owner), as: :json

      expect(ranch.map_areas.where(name: "Headquarters")).to exist
    end

    it "is only for the owner" do
      hand = create(:member, ranch:)

      patch "/api/v1/ranch", params: { headquarters: { lat: 43.0, lng: -89.4 } }, headers: auth_headers(hand), as: :json

      expect(response).to have_http_status(:forbidden)
      expect(ranch.reload.headquarters).to be_nil
    end

    it "rejects a size that isn't one of the choices" do
      patch "/api/v1/ranch", params: { headquarters: { lat: 43.0, lng: -89.4, miles: 2 } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(ranch.reload.headquarters).to be_nil
    end

    it "rejects a spot that isn't a number" do
      patch "/api/v1/ranch", params: { headquarters: { lat: "barn", lng: -89.4 } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(ranch.map_areas).to be_empty
    end
  end
end
