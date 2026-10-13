require "rails_helper"

RSpec.describe "Map tiles", type: :request do
  after { NaipTiles.storage.delete(NaipTiles.key(18, 65931, 96321)) }

  it "serves a stored tile without a token, cached for good" do
    NaipTiles.storage.upload(NaipTiles.key(18, 65931, 96321), StringIO.new("jpeg"))

    get "/api/v1/map/tiles/18/65931/96321.jpg"

    expect(response).to have_http_status(:ok)
    expect(response.media_type).to eq("image/jpeg")
    expect(response.body).to eq("jpeg")
    expect(response.headers["Cache-Control"]).to eq("max-age=31556952, public")
  end

  it "serves a state source's tiles from that source's folder" do
    NaipTiles.storage.upload(NaipTiles.key(19, 1, 2, "mt-naip-2025"), StringIO.new("montana"))

    get "/api/v1/map/tiles/mt-naip-2025/19/1/2.jpg"

    expect(response.body).to eq("montana")
  ensure
    NaipTiles.storage.delete(NaipTiles.key(19, 1, 2, "mt-naip-2025"))
  end

  it "answers 404 for a tile that was never rendered" do
    get "/api/v1/map/tiles/18/1/1.jpg"

    expect(response).to have_http_status(:not_found)
  end
end
