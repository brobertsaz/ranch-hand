require "rails_helper"

RSpec.describe Pasture do
  include ActiveJob::TestHelper

  it "queues a sharp area over the whole pasture and its margin, named for it" do
    pasture = nil
    expect { pasture = create(:pasture, name: "North Section") }.to have_enqueued_job(RenderMapAreaJob)

    area = pasture.ranch.map_areas.sole
    expect(area.name).to eq("North Section")
    expect(area.covers?(**pasture.bounds)).to be(true)
    expect((pasture.bounds[:south] - area.south) * MapArea::METERS_PER_DEGREE).to be_within(1).of(MapArea::MARGIN_METERS)
  end

  it "leaves the map alone when a sharp area already covers the pasture" do
    member = create(:member)
    create(:map_area, ranch: member.ranch, west: -89.47, south: 42.99, east: -89.44, north: 43.02)

    expect { create(:pasture, member: member) }.not_to have_enqueued_job(RenderMapAreaJob)
    expect(member.ranch.map_areas.count).to eq(1)
  end

  it "keeps the pasture when the ranch has no room for another area, and sharpens it once a render finishes" do
    member = create(:member)
    ranch = member.ranch
    busy = create_list(:map_area, MapArea::MAX_RENDERING_PER_RANCH, ranch: ranch, status: :rendering, west: -100, east: -99.999, south: 40, north: 40.001)

    pasture = create(:pasture, member: member)
    expect(pasture).to be_persisted
    expect(ranch.map_areas.count).to eq(MapArea::MAX_RENDERING_PER_RANCH)

    busy.first.update!(status: :ready)
    expect { pasture.sharpen }.to have_enqueued_job(RenderMapAreaJob)
    expect(ranch.map_areas.where(name: pasture.name)).to exist
  end

  it "only sharpens again when the outline moves, not on a rename" do
    pasture = create(:pasture)

    expect { pasture.update!(name: "Creek pasture") }.not_to have_enqueued_job(RenderMapAreaJob)
  end

  it "needs at least three corners" do
    pasture = build(:pasture, outline: [ [ -89.45, 43.0 ], [ -89.44, 43.0 ], [ -89.45, 43.0 ] ])

    expect(pasture).not_to be_valid
    expect(pasture.errors[:outline]).to include("needs at least 3 corners")
  end

  it "rejects an outline that isn't a list of points" do
    pasture = build(:pasture, outline: { "oops" => true })

    expect(pasture).not_to be_valid
    expect(pasture.errors[:outline]).to include("must be a list of [longitude, latitude] points")
  end
end
