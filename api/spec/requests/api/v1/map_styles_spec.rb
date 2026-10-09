require "rails_helper"

RSpec.describe "Map style", type: :request do
  it "serves a raster style without a device token so offline packs can fetch it" do
    get "/api/v1/map/style"

    expect(response).to have_http_status(:ok)
    expect(json.dig("sources", "imagery", "tiles")).to eq([ Api::V1::MapStylesController::DEFAULT_TILE_URL ])
    expect(json["layers"].pluck("id")).to eq(%w[background imagery])
  end
end
