require "rails_helper"

RSpec.describe ImagerySource do
  it "picks the state's own imagery inside Montana, Wyoming and Wisconsin" do
    expect(described_class.for(lng: -108.5, lat: 46.0).key).to eq("mt-naip-2025")
    expect(described_class.for(lng: -104.38, lat: 44.41).key).to eq("wy-naip-2024")
    expect(described_class.for(lng: -89.457, lat: 43.0).key).to eq("wi-dnr-leaf-off")
  end

  it "gives Wyoming the strip where its box overlaps Montana's" do
    expect(described_class.for(lng: -107.0, lat: 44.8).key).to eq("wy-naip-2024")
  end

  it "falls back to NAIP everywhere else" do
    expect(described_class.for(lng: -99.0, lat: 31.0)).to eq(described_class::NAIP)
  end

  it "renders zoom 19 only where the imagery is sharp enough for it" do
    expect(described_class.find("mt-naip-2025").zooms).to eq(17..19)
    expect(described_class::NAIP.zooms).to eq(17..18)
  end
end
