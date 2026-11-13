require "rails_helper"

RSpec.describe "Account", type: :request do
  include ActiveJob::TestHelper

  let(:owner) { create(:member, role: :owner, name: "Bob", email: "bob@example.com", google_sub: "google-123") }
  let(:ranch) { owner.ranch }
  let!(:hand) { create(:member, ranch: ranch, name: "Sam", email: "sam@example.com") }

  def delete_account(as:)
    delete "/api/v1/account", headers: auth_headers(as)
  end

  it "needs a device token" do
    delete "/api/v1/account"

    expect(response).to have_http_status(:unauthorized)
    expect(Member.count).to eq(2)
  end

  describe "a hand" do
    it "is removed and forgotten, and what they logged stays with the ranch" do
      waypoint = create(:waypoint, member: hand)
      observation = create(:observation, member: hand, waypoint: waypoint, status: "resolved", resolved_by: hand, resolved_at: 1.hour.ago)
      photo = create(:photo, observation: observation)
      ride = Ride.create!(id: "ride1", ranch: ranch, member: hand, started_at: 2.hours.ago, ended_at: 1.hour.ago, track: [ [ -104.38, 44.43 ] ])

      delete_account(as: hand)

      expect(response).to have_http_status(:no_content)
      expect(hand.reload).to have_attributes(name: "Former hand", email: nil, google_sub: nil, role: "hand")
      expect(hand).to be_removed
      expect([ waypoint, observation, photo, ride ].map { |record| record.reload.deleted_at }).to all(be_nil)
      expect(observation.member).to eq(hand)
    end

    it "frees their spot and stops their token" do
      create_list(:member, 2, ranch: ranch)
      expect(ranch).to be_full

      delete_account(as: hand)

      expect(ranch.reload).not_to be_full
      get "/api/v1/sync", headers: auth_headers(hand)
      expect(response).to have_http_status(:unauthorized)
      expect(json).to eq("error" => "removed")
    end

    it "reaches the other phones as Former hand on their next pull, still on the old pins" do
      observation = create(:observation, member: hand, updated_at: 1.day.ago)
      get "/api/v1/sync", headers: auth_headers(owner)
      last_pulled_at = json["timestamp"]

      delete_account(as: hand)

      get "/api/v1/sync", params: { last_pulled_at: last_pulled_at }, headers: auth_headers(owner)
      expect(json.dig("changes", "members", "updated")).to include(
        { "id" => hand.id.to_s, "name" => "Former hand", "role" => "hand", "removed" => true }
      )

      # A phone that joins later gets the old pin, and the name to put on it
      get "/api/v1/sync", headers: auth_headers(create(:member, ranch: ranch))
      expect(json.dig("changes", "observations", "created").sole).to include("id" => observation.id, "member_id" => hand.id.to_s)
      expect(json.dig("changes", "members", "updated").pluck("id", "name")).to include([ hand.id.to_s, "Former hand" ])
    end

    it "forgets a hand the owner had already removed, keeping the day they left" do
      hand.update!(removed_at: Time.zone.at(1_791_000_000))

      expect(hand.erase!).to be(true)

      expect(hand.reload).to have_attributes(name: "Former hand", email: nil, removed_at: Time.zone.at(1_791_000_000))
    end
  end

  describe "the owner" do
    let(:jpeg) { file_fixture("tag.jpg").binread }

    # A ranch with one of everything, and a photo file in storage
    def fill(ranch, member)
      waypoint = create(:waypoint, member: member)
      observation = create(:observation, member: member, waypoint: waypoint, status: "resolved", resolved_by: member)
      photo = create(:photo, observation: observation)
      photo.attach_file!(io: StringIO.new(jpeg), filename: "#{photo.id}.jpg", content_type: "image/jpeg")
      create(:photo, observation: observation, deleted_at: Time.current)
      create(:observation, member: member, deleted_at: Time.current)
      Ride.create!(id: "ride#{member.id}", ranch: ranch, member: member, started_at: 2.hours.ago, ended_at: 1.hour.ago, track: [ [ -104.38, 44.43 ] ])
      create(:map_area, ranch: ranch, status: :ready)
      photo
    end

    it "deletes the ranch and everything on it, for the whole crew" do
      photo = fill(ranch, hand)
      fill(ranch, owner)
      blob_key = photo.file.key
      area = ranch.map_areas.first

      expect {
        delete_account(as: owner)
      }.to have_enqueued_job(RemoveMapAreaTilesJob).with(area.source, area.bounds).exactly(2).times

      expect(response).to have_http_status(:no_content)
      expect(Ranch.exists?(ranch.id)).to be(false)
      expect([ Member, Waypoint, Observation, Photo, Ride, MapArea, ActiveStorage::Attachment ].map(&:count)).to all(eq(0))

      perform_enqueued_jobs
      expect(ActiveStorage::Blob.count).to eq(0)
      expect(ActiveStorage::Blob.service.exist?(blob_key)).to be(false)
    end

    it "leaves every token of that ranch with a bare 401" do
      fill(ranch, hand)
      removed = create(:member, ranch: ranch, removed_at: 1.day.ago)

      headers = [ owner, hand, removed ].map { |member| auth_headers(member) }

      delete_account(as: owner)

      expect(Device.count).to eq(0)
      headers.each do |header|
        get "/api/v1/sync", headers: header

        expect(response).to have_http_status(:unauthorized)
        expect(response.body).to be_empty
      end
    end

    it "doesn't touch another ranch" do
      neighbor = create(:member, role: :owner, name: "Ann")
      neighbor_photo = fill(neighbor.ranch, neighbor)
      fill(ranch, hand)

      delete_account(as: owner)
      perform_enqueued_jobs

      expect(Ranch.all).to eq([ neighbor.ranch ])
      expect(neighbor.ranch.members).to eq([ neighbor ])
      expect([ Waypoint, Observation, Photo, Ride, MapArea ].map { |model| model.where(ranch: neighbor.ranch).count }).to eq([ 1, 2, 2, 1, 1 ])
      expect(neighbor_photo.reload.file.download.b).to eq(jpeg)
      get "/api/v1/sync", headers: auth_headers(neighbor)
      expect(response).to have_http_status(:ok)
    end

    it "keeps the tiles a neighbor's sharp area still covers, and clears the rest" do
      area = create(:map_area, ranch: ranch, status: :ready)
      neighbor_area = create(:map_area, east: -89.4580, status: :ready)
      area.tiles.each { |tile| NaipTiles.storage.upload(NaipTiles.key(*tile), StringIO.new("jpeg")) }

      delete_account(as: owner)
      perform_enqueued_jobs

      shared, alone = area.tiles.partition { |tile| neighbor_area.tile?(*tile) }
      expect(shared).to be_present.and all(satisfy { |tile| NaipTiles.stored?(*tile) })
      expect(alone).to be_present.and all(satisfy { |tile| !NaipTiles.stored?(*tile) })
    ensure
      area.tiles.each { |tile| NaipTiles.delete(*tile) }
    end

    it "deletes nothing if any part of it fails" do
      fill(ranch, hand)
      allow(Member).to receive(:where).and_call_original
      allow(Member).to receive(:where).with(ranch_id: ranch.id).and_raise(ActiveRecord::StatementInvalid, "connection lost")

      expect { ranch.erase! }.to raise_error(ActiveRecord::StatementInvalid)

      expect(Ranch.exists?(ranch.id)).to be(true)
      expect([ Waypoint, Observation, Photo, Ride, MapArea, ActiveStorage::Attachment ].map(&:count)).to eq([ 1, 2, 2, 1, 1, 1 ])
      expect(enqueued_jobs.pluck("job_class")).not_to include("RemoveMapAreaTilesJob", "ActiveStorage::PurgeJob")
    end

    it "lets them start over with the same Google account" do
      delete_account(as: owner)

      expect(create(:member, role: :owner, google_sub: "google-123")).to be_persisted
    end
  end

  it "can still destroy a ranch the Rails way, members last" do
    create(:photo, observation: create(:observation, member: hand, waypoint: create(:waypoint, member: owner)))

    expect { ranch.destroy! }.not_to raise_error
    expect([ Ranch, Member, Observation, Photo, Waypoint ].map(&:count)).to all(eq(0))
  end
end
