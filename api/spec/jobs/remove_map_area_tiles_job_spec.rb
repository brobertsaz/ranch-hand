require "rails_helper"

RSpec.describe RemoveMapAreaTilesJob do
  # The factory's area: 13 tiles near Madison, WI
  let(:removed) { build(:map_area) }
  let(:stored) { [] }

  def store(tiles, source = "naip")
    tiles.each do |tile|
      NaipTiles.storage.upload(NaipTiles.key(*tile, source), StringIO.new("jpeg"))
      stored << NaipTiles.key(*tile, source)
    end
  end

  before { store(removed.tiles) }
  after { stored.each { |key| NaipTiles.storage.delete(key) } }

  it "clears every tile of an area nothing else covers" do
    described_class.perform_now(removed.source, removed.bounds)

    expect(removed.tiles).to all(satisfy { |tile| !NaipTiles.stored?(*tile) })
  end

  it "leaves the tiles another area still covers, on any ranch" do
    # The west half of the same ground, on a neighbor's ranch
    neighbor = create(:map_area, east: -89.4580)
    shared, alone = removed.tiles.partition { |tile| neighbor.tile?(*tile) }
    expect(shared).to be_present
    expect(alone).to be_present

    described_class.perform_now(removed.source, removed.bounds)

    expect(shared).to all(satisfy { |tile| NaipTiles.stored?(*tile) })
    expect(alone).to all(satisfy { |tile| !NaipTiles.stored?(*tile) })
  end

  it "doesn't count an overlapping area drawn from other imagery, whose tiles live in another folder" do
    other = create(:map_area, source: "wi-dnr-leaf-off")
    store(other.tiles, other.source)

    described_class.perform_now(removed.source, removed.bounds)

    expect(removed.tiles).to all(satisfy { |tile| !NaipTiles.stored?(*tile) })
    expect(other.tiles).to all(satisfy { |tile| NaipTiles.stored?(*tile, other.source) })
  end

  it "notices an area added over the same ground while it works" do
    stub_const("#{described_class}::CHECK_EVERY", 4)
    allow(NaipTiles).to receive(:delete).and_wrap_original do |original, *tile|
      create(:map_area) if MapArea.none?
      original.call(*tile)
    end

    described_class.perform_now(removed.source, removed.bounds)

    expect(removed.tiles.count { |tile| NaipTiles.stored?(*tile) }).to eq(9)
  end
end
