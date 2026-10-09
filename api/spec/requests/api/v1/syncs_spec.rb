require "rails_helper"

RSpec.describe "Sync", type: :request do
  let(:member) { create(:member) }
  let(:ranch) { member.ranch }

  def raw_observation(id, **overrides)
    {
      id: id, kind: "sick_animal", latitude: 44.4312345, longitude: -104.3812345, accuracy: 4.5,
      observed_at: 1_791_000_000_000, tag_number: "1234", note: "Limping, left hind", status: "open",
      _status: "created", _changed: ""
    }.merge(overrides)
  end

  def push(changes, as: member)
    post "/api/v1/sync", params: { changes: changes }, headers: auth_headers(as), as: :json
  end

  def pull(last_pulled_at = nil, as: member)
    get "/api/v1/sync", params: { last_pulled_at: last_pulled_at }.compact, headers: auth_headers(as)
  end

  it "requires a device token" do
    get "/api/v1/sync"

    expect(response).to have_http_status(:unauthorized)
  end

  describe "pull" do
    it "sends every live record as created on the first pull" do
      observation = create(:observation, member: member)
      create(:observation, member: member, deleted_at: Time.current)
      create(:observation) # another ranch
      photo = create(:photo, observation: observation, uploaded_at: Time.zone.at(1_791_000_000))

      freeze_time do
        pull

        expect(json["timestamp"]).to eq(to_ms(Time.current))
      end
      expect(json.dig("changes", "observations", "created")).to contain_exactly(
        hash_including("id" => observation.id, "member_id" => member.id.to_s, "kind" => "sick_animal", "status" => "open")
      )
      expect(json.dig("changes", "photos", "created")).to eq(
        [ { "id" => photo.id, "observation_id" => observation.id, "uploaded_at" => 1_791_000_000_000 } ]
      )
    end

    it "sends only changes and deletions after the last pull" do
      old = create(:observation, member: member, updated_at: 1.hour.ago)
      changed = create(:observation, member: member)
      gone = create(:observation, member: member, deleted_at: Time.current)

      pull(to_ms(10.minutes.ago))

      observations = json.dig("changes", "observations")
      expect(observations["created"]).to eq([])
      expect(observations["updated"].pluck("id")).to eq([ changed.id ])
      expect(observations["deleted"]).to eq([ gone.id ])
      expect(observations["updated"].pluck("id")).not_to include(old.id)
    end
  end

  describe "push" do
    it "creates observations with the phone's ids and the pushing member" do
      push({ observations: { created: [ raw_observation("abc123") ], updated: [], deleted: [] } })

      expect(response).to have_http_status(:no_content)
      observation = Observation.find("abc123")
      expect(observation).to have_attributes(
        ranch: ranch, member: member, kind: "sick_animal", tag_number: "1234",
        latitude: BigDecimal("44.4312345"), observed_at: Time.zone.at(1_791_000_000)
      )
    end

    it "lets the last write win on an update, from any member of the ranch" do
      observation = create(:observation, member: member)
      teammate = create(:member, ranch: ranch)

      push({ observations: { created: [], updated: [ raw_observation(observation.id, status: "resolved") ], deleted: [] } }, as: teammate)

      expect(observation.reload).to have_attributes(status: "resolved", member: member)
    end

    it "keeps an all-clear check out of the open count" do
      push({ observations: { created: [ raw_observation("full1", kind: "water_check", note: "Full", status: "ok") ], updated: [], deleted: [] } })

      expect(Observation.find("full1")).to be_ok
    end

    it "rejects a status it doesn't know" do
      push({ observations: { created: [ raw_observation("odd1", status: "maybe") ], updated: [], deleted: [] } })

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "soft-deletes so other phones hear about it" do
      observation = create(:observation, member: member)

      push({ observations: { created: [], updated: [], deleted: [ observation.id ] } })

      expect(observation.reload.deleted_at).to be_present
    end

    it "creates photo records for an observation in the same push" do
      push({
        observations: { created: [ raw_observation("abc123") ], updated: [], deleted: [] },
        photos: { created: [ { id: "pho1", observation_id: "abc123", uploaded_at: 1 } ], updated: [], deleted: [] }
      })

      expect(Photo.find("pho1")).to have_attributes(observation_id: "abc123", ranch: ranch, uploaded_at: nil)
    end

    it "refuses to touch another ranch's records" do
      outsider = create(:observation)

      push({ observations: { created: [], updated: [ raw_observation(outsider.id, note: "mine now") ], deleted: [] } })

      expect(response).to have_http_status(:forbidden)
      expect(outsider.reload.note).to be_nil
    end

    it "rolls back the whole push when a record is invalid" do
      push({ observations: { created: [ raw_observation("good"), raw_observation("bad", kind: "ufo") ], updated: [], deleted: [] } })

      expect(response).to have_http_status(:unprocessable_content)
      expect(Observation.count).to eq(0)
    end
  end

  describe "waypoints" do
    def raw_waypoint(id, **overrides)
      { id: id, kind: "water", name: "Water 1", latitude: 44.4301, longitude: -104.3801, note: nil }.merge(overrides)
    end

    it "pulls the ranch's places alongside observations" do
      waypoint = create(:waypoint, member: member, name: "North tank")
      create(:observation, member: member, kind: "water_check", waypoint: waypoint, note: "Low")
      create(:waypoint) # another ranch

      pull

      expect(json.dig("changes", "waypoints", "created")).to eq(
        [ { "id" => waypoint.id, "member_id" => member.id.to_s, "kind" => "water", "name" => "North tank",
            "latitude" => 44.43, "longitude" => -104.38, "note" => nil } ]
      )
      expect(json.dig("changes", "observations", "created").sole).to include("kind" => "water_check", "waypoint_id" => waypoint.id)
    end

    it "creates a new place and an observation linked to it in one push" do
      push({
        waypoints: { created: [ raw_waypoint("tank1") ], updated: [], deleted: [] },
        observations: { created: [ raw_observation("check1", kind: "water_check", note: "Low", waypoint_id: "tank1") ], updated: [], deleted: [] }
      })

      expect(response).to have_http_status(:no_content)
      expect(Waypoint.find("tank1")).to have_attributes(ranch: ranch, member: member, kind: "water", name: "Water 1")
      expect(Observation.find("check1").waypoint_id).to eq("tank1")
    end

    it "accepts the gate kind" do
      push({ observations: { created: [ raw_observation("gate1", kind: "gate_issue", note: "Left open") ], updated: [], deleted: [] } })

      expect(Observation.find("gate1").kind).to eq("gate_issue")
    end

    it "won't link an observation to another ranch's place" do
      outsider = create(:waypoint)

      push({ observations: { created: [ raw_observation("sneaky", waypoint_id: outsider.id) ], updated: [], deleted: [] } })

      expect(response).to have_http_status(:unprocessable_content)
      expect(Observation.exists?("sneaky")).to be(false)
    end

    it "refuses to rename another ranch's place" do
      outsider = create(:waypoint)

      push({ waypoints: { created: [], updated: [ raw_waypoint(outsider.id, name: "Mine") ], deleted: [] } })

      expect(response).to have_http_status(:forbidden)
      expect(outsider.reload.name).not_to eq("Mine")
    end
  end

  describe "members" do
    it "sends the crew's names so pins can say who logged them" do
      create(:member, ranch: ranch, name: "Sam")
      create(:member, name: "Outsider")

      pull

      expect(json.dig("changes", "members", "updated").pluck("name")).to contain_exactly(member.name, "Sam")
    end

    it "sends the whole crew even on later pulls, for phones that synced before names existed" do
      create(:member, ranch: ranch, name: "Sam", updated_at: 1.day.ago)

      pull(to_ms(1.minute.ago))

      expect(json.dig("changes", "members", "updated").pluck("name")).to include("Sam")
    end
  end

  describe "resolving" do
    it "records who resolved it and when, as set on the phone" do
      observation = create(:observation, member: member)
      teammate = create(:member, ranch: ranch)

      push({ observations: { created: [], updated: [ raw_observation(observation.id, status: "resolved", resolved_at: 1_791_100_000_000, resolved_by_id: teammate.id.to_s) ], deleted: [] } }, as: teammate)

      expect(observation.reload).to have_attributes(status: "resolved", resolved_by: teammate, resolved_at: Time.zone.at(1_791_100_000))
      pull
      expect(json.dig("changes", "observations", "created").sole).to include("resolved_at" => 1_791_100_000_000, "resolved_by_id" => teammate.id.to_s)
    end

    it "won't credit a member of another ranch" do
      observation = create(:observation, member: member)

      push({ observations: { created: [], updated: [ raw_observation(observation.id, status: "resolved", resolved_by_id: create(:member).id.to_s) ], deleted: [] } })

      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "rides" do
    def raw_ride(id, **overrides)
      {
        id: id, started_at: 1_791_000_000_000, ended_at: 1_791_003_600_000, distance_meters: 5230.5,
        track: [ [ -104.38, 44.43 ], [ -104.37, 44.44 ] ].to_json
      }.merge(overrides)
    end

    it "takes a finished ride from the phone and hands it to the crew" do
      push({ rides: { created: [ raw_ride("ride1") ], updated: [], deleted: [] } })

      expect(response).to have_http_status(:no_content)
      expect(Ride.find("ride1")).to have_attributes(member: member, ranch: ranch, distance_meters: 5230.5, track: [ [ -104.38, 44.43 ], [ -104.37, 44.44 ] ])

      pull(nil, as: create(:member, ranch: ranch))
      expect(json.dig("changes", "rides", "created").sole).to include("id" => "ride1", "member_id" => member.id.to_s, "track" => "[[-104.38,44.43],[-104.37,44.44]]")
    end

    it "carries a ride's name, including one given after it synced" do
      push({ rides: { created: [ raw_ride("ride3", name: "North pasture") ], updated: [], deleted: [] } })
      push({ rides: { created: [], updated: [ raw_ride("ride3", name: " North pasture via the creek gate ") ], deleted: [] } })

      expect(Ride.find("ride3").name).to eq("North pasture via the creek gate")
      pull(nil, as: create(:member, ranch: ranch))
      expect(json.dig("changes", "rides", "created").sole).to include("name" => "North pasture via the creek gate")
    end

    it "rejects a track that isn't a list of points" do
      push({ rides: { created: [ raw_ride("ride2", track: '{"oops":true}') ], updated: [], deleted: [] } })

      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  # Acceptance steps 4 and 5 from PLAN.md, at the API level
  it "carries a pin and its photo from one phone to another" do
    other_phone = create(:member, ranch: ranch, name: "Sam")
    pull(nil, as: other_phone)
    other_last_pulled_at = json["timestamp"]

    push({
      observations: { created: [ raw_observation("pin1") ], updated: [], deleted: [] },
      photos: { created: [ { id: "photo1", observation_id: "pin1" } ], updated: [], deleted: [] }
    })
    put "/api/v1/photos/photo1/file", params: file_fixture("tag.jpg").binread,
      headers: auth_headers(member).merge("Content-Type" => "image/jpeg")

    pull(other_last_pulled_at, as: other_phone)

    expect(json.dig("changes", "observations", "updated")).to contain_exactly(hash_including("id" => "pin1", "tag_number" => "1234"))
    expect(json.dig("changes", "photos", "updated")).to contain_exactly(hash_including("id" => "photo1", "uploaded_at" => be_present))

    get "/api/v1/photos/photo1/file", headers: auth_headers(other_phone)
    follow_redirect! while response.redirect?
    expect(response.body.b).to eq(file_fixture("tag.jpg").binread)
  end
end
