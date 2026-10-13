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

  it "saves progress as it goes, for the app's progress bar" do
    stub_const("#{described_class}::CHECK_EVERY", 5)
    stub_const("#{described_class}::THREADS", 1)
    progress = []
    allow(NaipTiles).to receive(:fetch) { progress << area.reload.tile_count && "jpeg" }

    described_class.perform_now(area)

    expect(progress.uniq).to eq([ 0, 5, 10 ])
  end

  it "stops when the area is removed mid-render" do
    stub_const("#{described_class}::CHECK_EVERY", 1)
    stub_const("#{described_class}::THREADS", 1)
    allow(NaipTiles).to receive(:fetch) { MapArea.where(id: area.id).delete_all && "jpeg" }

    described_class.perform_now(area)

    expect(NaipTiles).to have_received(:fetch).once
  end

  it "marks the area failed when tiles keep failing" do
    allow(NaipTiles).to receive(:fetch).and_raise("HTTP 500")
    allow_any_instance_of(described_class).to receive(:sleep)

    described_class.perform_now(area)

    expect(area.reload).to be_failed
    expect(area.error).to start_with("13 tiles failed")
  end
end
