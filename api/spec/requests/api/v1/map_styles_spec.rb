require "rails_helper"

RSpec.describe "Map style", type: :request do
  it "serves a raster style without a device token so offline packs can fetch it" do
    get "/api/v1/map/style"

    expect(response).to have_http_status(:ok)
    expect(json.dig("sources", "imagery", "tiles")).to eq([ Api::V1::MapStylesController::DEFAULT_TILE_URL ])
    expect(json.dig("sources", "topo", "tiles")).to eq([ Api::V1::MapStylesController::DEFAULT_TOPO_TILE_URL ])
    expect(json["layers"].pluck("id")).to eq(%w[background imagery aerial-top])
  end

  it "lets MapLibre use its offline copy without revalidating" do
    get "/api/v1/map/style"

    expect(response.headers["Cache-Control"]).to eq("max-age=3600, public")
  end

  context "with the app's token" do
    let(:member) { create(:member) }

    it "adds a sharp layer for each ready area, between the USGS imagery and Topo" do
      area = create(:map_area, ranch: member.ranch, status: :ready)
      create(:map_area, ranch: member.ranch, status: :rendering)
      create(:map_area, status: :ready)

      get "/api/v1/map/style", headers: auth_headers(member)

      expect(json["layers"].pluck("id")).to eq([ "background", "imagery", "naip-#{area.id}", "aerial-top" ])
      expect(json.dig("sources", "naip-#{area.id}")).to include(
        "tiles" => [ "http://www.example.com/api/v1/map/tiles/{z}/{x}/{y}.jpg" ],
        "minzoom" => 17,
        "maxzoom" => 18,
        "bounds" => [ area.west, area.south, area.east, area.north ]
      )
    end

    it "points a state-imagery area at its own tiles and zooms" do
      area = create(:map_area, ranch: member.ranch, status: :ready, source: "mt-naip-2025")

      get "/api/v1/map/style", headers: auth_headers(member)

      expect(json.dig("sources", "naip-#{area.id}")).to include(
        "tiles" => [ "http://www.example.com/api/v1/map/tiles/mt-naip-2025/{z}/{x}/{y}.jpg" ],
        "maxzoom" => 19,
        "attribution" => "USDA NAIP 2025 via Montana State Library"
      )
    end

    it "takes the token from the style URL, which is how the app sends it" do
      area = create(:map_area, ranch: member.ranch, status: :ready)

      get "/api/v1/map/style", params: { token: member.device_token }

      expect(json["layers"].pluck("id")).to include("naip-#{area.id}")
    end

    it "gives a bad token the plain style" do
      create(:map_area, ranch: member.ranch, status: :ready)

      get "/api/v1/map/style", params: { token: "nope" }

      expect(json["layers"].pluck("id")).to eq(%w[background imagery aerial-top])
    end

    it "keeps one ranch's style out of shared caches, and fresh enough for a new area" do
      get "/api/v1/map/style", headers: auth_headers(member)

      expect(response.headers["Cache-Control"]).to eq("max-age=0, private")
    end
  end
end
