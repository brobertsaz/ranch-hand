require "rails_helper"

RSpec.describe NaipTiles do
  let(:box) { { west: -89.4590, south: 43.0025, east: -89.4565, north: 43.0040 } }

  it "lists every zoom 17 and 18 tile touching a box" do
    tiles = described_class.tiles_in(**box)

    expect(tiles.size).to eq(13)
    expect(tiles.map(&:first).tally).to eq(17 => 4, 18 => 9)
    expect(tiles).to include([ 18, 65931, 96321 ])
    expect(described_class.count_in(**box)).to eq(13)
  end

  it "gives the ImageServer the tile's box in web mercator" do
    west, south, east, north = described_class.mercator_bbox(1, 1, 0)

    expect([ west, south, east, north ]).to eq([ 0.0, 0.0, described_class::ORIGIN, described_class::ORIGIN ])
  end

  it "stores a fetched tile under its z/x/y key" do
    allow(described_class).to receive(:fetch).with(18, 1, 2).and_return("jpeg bytes")

    described_class.fetch_and_store(18, 1, 2)

    expect(described_class.stored?(18, 1, 2)).to be(true)
    expect(described_class.read(18, 1, 2)).to eq("jpeg bytes")
  ensure
    described_class.storage.delete(described_class.key(18, 1, 2))
  end
end
