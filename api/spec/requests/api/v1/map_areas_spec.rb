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

  it "needs a device token" do
    get "/api/v1/map_areas"

    expect(response).to have_http_status(:unauthorized)
  end
end
