require "rails_helper"

RSpec.describe "Map areas", type: :request do
  include ActiveJob::TestHelper

  let(:member) { create(:member) }

  it "lists the ranch's areas and not other ranches'" do
    create(:map_area, ranch: member.ranch, name: "North pasture", status: :ready, tile_count: 13)
    create(:map_area, name: "Somebody else's")

    get "/api/v1/map_areas", headers: auth_headers(member)

    expect(response).to have_http_status(:ok)
    expect(json.pluck("name")).to eq([ "North pasture" ])
    expect(json.first).to include("status" => "ready", "tile_count" => 13, "estimated_tiles" => 13)
  end

  it "pads the box and queues the render" do
    expect {
      post "/api/v1/map_areas", params: { map_area: { name: "Creek", west: -89.46, south: 43.0, east: -89.45, north: 43.01 } }, headers: auth_headers(member)
    }.to have_enqueued_job(RenderMapAreaJob)

    expect(response).to have_http_status(:created)
    area = member.ranch.map_areas.sole
    expect(area).to have_attributes(name: "Creek", status: "pending")
    expect(area.south).to be < 43.0
    expect(area.east).to be > -89.45
  end

  it "sharpens from the state's own imagery where there is some, with its extra zoom" do
    post "/api/v1/map_areas", params: { map_area: { west: -108.51, south: 45.99, east: -108.50, north: 46.0 } }, headers: auth_headers(member)

    expect(json).to include("source" => "mt-naip-2025", "source_name" => "Montana 2025", "max_zoom" => 19)
    expect(member.ranch.map_areas.sole.tiles.map(&:first).uniq).to eq([ 17, 18, 19 ])
  end

  it "estimates an area before it's made, without saving it" do
    get "/api/v1/map_areas/new", params: { west: -108.51, south: 45.99, east: -108.50, north: 46.0 }, headers: auth_headers(member)

    expect(response).to have_http_status(:ok)
    expect(json).to include("source_name" => "Montana 2025", "max_zoom" => 19)
    expect(json["estimated_tiles"]).to be > 100
    expect(json["estimated_minutes"]).to be >= 1
    expect(MapArea.count).to eq(0)
  end

  it "estimates so many miles around a point, for the headquarters screen" do
    get "/api/v1/map_areas/new", params: { lat: 43.0, lng: -89.4, miles: 3 }, headers: auth_headers(member)

    expect(response).to have_http_status(:ok)
    expect(json).to include("source_name" => "Wisconsin leaf-off", "max_zoom" => 19)
    expect(json["estimated_megabytes"]).to eq((json["estimated_tiles"] * MapArea::KILOBYTES_PER_TILE / 1000.0).ceil)
    expect(json["estimated_tiles"]).to be_between(9_000, 11_000)
  end

  it "sharpens so many miles around a point, with the pasture's name" do
    expect {
      post "/api/v1/map_areas", params: { map_area: { name: " North pasture ", lat: 43.0, lng: -89.4, miles: 1 } }, headers: auth_headers(member)
    }.to have_enqueued_job(RenderMapAreaJob)

    expect(response).to have_http_status(:created)
    area = member.ranch.map_areas.sole
    expect(area.name).to eq("North pasture")
    expect(area.covers?(west: -89.4, south: 43.0, east: -89.4, north: 43.0)).to be(true)
    expect((area.north - area.south) * MapArea::METERS_PER_DEGREE).to be_within(10).of(MapArea::METERS_PER_MILE)
  end

  it "names an unnamed area" do
    post "/api/v1/map_areas", params: { map_area: { west: -89.46, south: 43.0, east: -89.45, north: 43.01 } }, headers: auth_headers(member)

    expect(json["name"]).to eq("Area 1")
  end

  it "refuses an area too big to render" do
    post "/api/v1/map_areas", params: { map_area: { west: -90, south: 43, east: -89, north: 44 } }, headers: auth_headers(member)

    expect(response).to have_http_status(:unprocessable_content)
    expect(json["error"]).to start_with("Area is too big to sharpen")
  end

  it "refuses bounds that aren't numbers" do
    post "/api/v1/map_areas", params: { map_area: { west: "here", south: 43, east: -89, north: 44 } }, headers: auth_headers(member)

    expect(response).to have_http_status(:unprocessable_content)
  end

  it "refuses bounds off the map or without end, for an estimate or for real" do
    [
      { west: -89.46, south: 43.0, east: -89.45, north: 95 },
      { west: -189.46, south: 43.0, east: -89.45, north: 43.01 },
      { west: -89.46, south: 43.0, east: "Infinity", north: 43.01 },
      { west: -89.46, south: 43.0, east: "1e999", north: 43.01 },
      { west: -89.46, south: "NaN", east: -89.45, north: 43.01 },
      { west: -89.45, south: 43.0, east: -89.46, north: 43.01 },
      { lat: 89.9999, lng: -89.4, miles: 5 },
      { lat: 43.0, lng: -89.4, miles: "-Infinity" },
      { west: [ 1 ], south: 43.0, east: -89.45, north: 43.01 }
    ].each do |box|
      get "/api/v1/map_areas/new", params: box, headers: auth_headers(member)
      expect(response).to have_http_status(:unprocessable_content), "estimate for #{box} gave #{response.status}"
      expect(json["error"]).to be_present

      post "/api/v1/map_areas", params: { map_area: box }, headers: auth_headers(member)
      expect(response).to have_http_status(:unprocessable_content), "create for #{box} gave #{response.status}"
    end
    expect(MapArea.count).to eq(0)
  end

  describe "limits per ranch" do
    let(:box) { { west: -89.46, south: 43.0, east: -89.45, north: 43.01 } }

    it "stops at so many areas, and says to remove one" do
      stub_const("MapArea::MAX_PER_RANCH", 2)
      create_list(:map_area, 2, ranch: member.ranch, status: :ready)
      create_list(:map_area, 2, status: :ready) # another ranch's don't count

      expect {
        post "/api/v1/map_areas", params: { map_area: box }, headers: auth_headers(member)
      }.not_to have_enqueued_job(RenderMapAreaJob)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to eq("This ranch already has 2 sharp areas. Remove one before adding another.")
      expect(member.ranch.map_areas.count).to eq(2)
    end

    it "stops at two renders at a time, and says to wait" do
      create(:map_area, ranch: member.ranch, status: :pending)
      create(:map_area, ranch: member.ranch, status: :rendering)

      post "/api/v1/map_areas", params: { map_area: box }, headers: auth_headers(member)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to eq("2 areas are still being sharpened. Wait for one to finish before adding another.")
    end

    it "takes another once a render has finished or failed" do
      create(:map_area, ranch: member.ranch, status: :ready)
      create(:map_area, ranch: member.ranch, status: :failed)
      create(:map_area, ranch: member.ranch, status: :rendering)

      post "/api/v1/map_areas", params: { map_area: box }, headers: auth_headers(member)

      expect(response).to have_http_status(:created)
    end

    it "still gives an estimate when the ranch is at its limit" do
      create_list(:map_area, 2, ranch: member.ranch, status: :rendering)

      get "/api/v1/map_areas/new", params: box, headers: auth_headers(member)

      expect(response).to have_http_status(:ok)
    end

    it "holds for the headquarters pin too, which then stays where it was" do
      owner = create(:member, ranch: member.ranch, role: :owner)
      create_list(:map_area, 2, ranch: member.ranch, status: :rendering)

      patch "/api/v1/ranch", params: { headquarters: { lat: 43.0, lng: -89.4 } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to start_with("2 areas are still being sharpened")
      expect(member.ranch.reload.headquarters).to be_nil
    end
  end

  describe "removing an area" do
    let(:owner) { create(:member, ranch: member.ranch, role: :owner) }

    it "is the owner's call, and stops its render" do
      area = create(:map_area, ranch: member.ranch)

      expect {
        delete "/api/v1/map_areas/#{area.id}", headers: auth_headers(owner)
      }.to have_enqueued_job(RemoveMapAreaTilesJob).with(area.source, area.bounds)

      expect(response).to have_http_status(:no_content)
      expect(MapArea.exists?(area.id)).to be(false)
    end

    it "isn't open to a hand" do
      area = create(:map_area, ranch: member.ranch)

      expect {
        delete "/api/v1/map_areas/#{area.id}", headers: auth_headers(member)
      }.not_to have_enqueued_job(RemoveMapAreaTilesJob)

      expect(response).to have_http_status(:forbidden)
      expect(MapArea.exists?(area.id)).to be(true)
    end
  end

  it "won't remove another ranch's area" do
    area = create(:map_area)

    delete "/api/v1/map_areas/#{area.id}", headers: auth_headers(create(:member, ranch: member.ranch, role: :owner))

    expect(response).to have_http_status(:not_found)
    expect(MapArea.exists?(area.id)).to be(true)
  end

  it "needs a device token" do
    get "/api/v1/map_areas"

    expect(response).to have_http_status(:unauthorized)
  end
end
