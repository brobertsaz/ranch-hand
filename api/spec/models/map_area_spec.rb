require "rails_helper"

RSpec.describe MapArea do
  it "pads a box by about 400 m on every side" do
    padded = described_class.padded(west: -89.46, south: 43.0, east: -89.45, north: 43.01)

    expect((43.0 - padded[:south]) * described_class::METERS_PER_DEGREE).to be_within(1).of(400)
    expect(padded[:east] - -89.45).to be > (43.0 - padded[:south])
  end

  it "rejects a box with its sides swapped" do
    area = build(:map_area, west: -89.45, east: -89.46)

    expect(area).not_to be_valid
    expect(area.errors[:base]).to include("West must be less than east and south less than north")
  end

  it "rejects an area too big to render" do
    area = build(:map_area, west: -90.0, south: 43.0, east: -89.0, north: 44.0)

    expect(area).not_to be_valid
    expect(area.errors[:base].first).to start_with("Area is too big to sharpen")
  end
end
