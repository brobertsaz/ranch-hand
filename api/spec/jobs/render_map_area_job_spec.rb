require "rails_helper"

RSpec.describe RenderMapAreaJob do
  let(:area) { create(:map_area) }

  after { area.tiles.each { |tile| NaipTiles.storage.delete(NaipTiles.key(*tile)) } }

  it "stores every tile and marks the area ready" do
    allow(NaipTiles).to receive(:fetch).and_return("jpeg")

    described_class.perform_now(area)

    expect(area.reload).to be_ready
    expect(area.tile_count).to eq(13)
    expect(area.rendered_at).to be_present
    expect(area.tiles).to all(satisfy { |tile| NaipTiles.stored?(*tile) })
  end

  it "skips tiles already stored, so a rerun resumes" do
    NaipTiles.storage.upload(NaipTiles.key(18, 65931, 96321), StringIO.new("old"))
    allow(NaipTiles).to receive(:fetch).and_return("jpeg")

    described_class.perform_now(area)

    expect(NaipTiles).to have_received(:fetch).exactly(12).times
    expect(NaipTiles.read(18, 65931, 96321)).to eq("old")
  end

  it "marks the area failed when tiles keep failing" do
    allow(NaipTiles).to receive(:fetch).and_raise("HTTP 500")
    allow_any_instance_of(described_class).to receive(:sleep)

    described_class.perform_now(area)

    expect(area.reload).to be_failed
    expect(area.error).to start_with("13 tiles failed")
  end
end
