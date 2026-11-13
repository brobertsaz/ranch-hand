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

  def rejected = json["rejected"]

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

    # The save and the commit can be far apart; a pull in between must not lose the record for good
    it "re-sends what was saved in the minutes before the last pull, in case it committed after" do
      late = create(:observation, member: member, updated_at: 3.minutes.ago)
      gone = create(:observation, member: member, deleted_at: 3.minutes.ago, updated_at: 3.minutes.ago)
      older = create(:observation, member: member, updated_at: 10.minutes.ago)

      pull(to_ms(1.second.ago))

      observations = json.dig("changes", "observations")
      expect(observations["updated"].pluck("id")).to eq([ late.id ])
      expect(observations["deleted"]).to eq([ gone.id ])
      expect(observations["updated"].pluck("id")).not_to include(older.id)
    end

    it "turns away a last_pulled_at that isn't a time" do
      get "/api/v1/sync?last_pulled_at[]=1", headers: auth_headers(member)
      expect(response).to have_http_status(:unprocessable_content)

      pull("yesterday")
      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "push" do
    it "creates observations with the phone's ids and the pushing member" do
      push({ observations: { created: [ raw_observation("abc123") ], updated: [], deleted: [] } })

      expect(response).to have_http_status(:ok)
      expect(rejected).to eq([])
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

      expect(response).to have_http_status(:ok)
      expect(rejected).to eq([ { "table" => "observations", "id" => "odd1", "reason" => "Status is not included in the list" } ])
      expect(Observation.exists?("odd1")).to be(false)
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

      expect(response).to have_http_status(:ok)
      expect(rejected).to eq([ { "table" => "observations", "id" => outsider.id, "reason" => "id is already in use" } ])
      expect(outsider.reload).to have_attributes(note: nil, ranch_id: outsider.ranch_id)
    end

    it "refuses to delete another ranch's records" do
      outsider = create(:observation)

      push({ observations: { created: [], updated: [], deleted: [ outsider.id ] } })

      expect(rejected.sole).to include("table" => "observations", "id" => outsider.id)
      expect(outsider.reload.deleted_at).to be_nil
    end

    it "skips a record that is invalid, says why, and still takes the rest" do
      push({
        observations: { created: [ raw_observation("good"), raw_observation("bad", kind: "ufo"), raw_observation("fine") ], updated: [], deleted: [] }
      })

      expect(response).to have_http_status(:ok)
      expect(rejected).to eq([ { "table" => "observations", "id" => "bad", "reason" => "Kind is not included in the list" } ])
      expect(Observation.pluck(:id)).to contain_exactly("good", "fine")
    end

    it "soft-deletes an observation's photos along with it" do
      observation = create(:observation, member: member)
      photo = create(:photo, observation: observation)
      last_pulled_at = to_ms(1.minute.ago)

      push({ observations: { created: [], updated: [], deleted: [ observation.id ] } })

      expect(photo.reload.deleted_at).to be_present
      pull(last_pulled_at, as: create(:member, ranch: ranch))
      expect(json.dig("changes", "photos", "deleted")).to eq([ photo.id ])
    end

    it "rejects a photo whose observation the server doesn't have, and keeps the one it does" do
      push({
        observations: { created: [ raw_observation("abc123") ], updated: [], deleted: [] },
        photos: { created: [ { id: "orphan", observation_id: "never-arrived" }, { id: "pho1", observation_id: "abc123" } ], updated: [], deleted: [] }
      })

      expect(rejected).to eq([ { "table" => "photos", "id" => "orphan", "reason" => "Observation must exist" } ])
      expect(Photo.pluck(:id)).to eq([ "pho1" ])
    end

    it "rejects a photo for another ranch's observation" do
      outsider = create(:observation)

      push({ photos: { created: [ { id: "pho1", observation_id: outsider.id } ], updated: [], deleted: [] } })

      expect(rejected.sole).to include("table" => "photos", "id" => "pho1")
      expect(Photo.count).to eq(0)
    end

    it "rejects text that is too long, one record at a time" do
      push({
        observations: { created: [
          raw_observation("longnote", note: "x" * 2001), raw_observation("longtag", tag_number: "9" * 41), raw_observation("justright", note: "x" * 2000)
        ], updated: [], deleted: [] }
      })

      expect(rejected.pluck("id", "reason")).to eq([
        [ "longnote", "Note is too long (maximum is 2000 characters)" ], [ "longtag", "Tag number is too long (maximum is 40 characters)" ]
      ])
      expect(Observation.pluck(:id)).to eq([ "justright" ])
    end

    it "rejects ids that are too long or aren't text, without looking them up" do
      existing = create(:observation, member: member)

      push({ observations: {
        created: [ raw_observation("x" * 65), raw_observation([ existing.id ], note: "hijacked"), raw_observation(nil) ],
        updated: [], deleted: [ [ existing.id ], "y" * 65 ]
      } })

      expect(response).to have_http_status(:ok)
      expect(rejected.pluck("id")).to eq([ "x" * 64, nil, nil, nil, "y" * 64 ])
      expect(rejected.pluck("reason").uniq).to eq([ "id must be text of 1 to 64 characters" ])
      expect(existing.reload).to have_attributes(note: nil, deleted_at: nil)
      expect(Observation.count).to eq(1)
    end

    it "costs a phone one record, not its sync, when the database refuses it" do
      allow(Rails.error).to receive(:report)

      # A date Postgres can't store gets past validation
      push({ observations: { created: [ raw_observation("farfuture", observed_at: 10**19), raw_observation("good") ], updated: [], deleted: [] } })

      expect(response).to have_http_status(:ok)
      expect(rejected).to eq([ { "table" => "observations", "id" => "farfuture", "reason" => "could not be saved" } ])
      expect(Observation.pluck(:id)).to eq([ "good" ])
      expect(Rails.error).to have_received(:report).once
    end

    it "treats a timestamp that isn't a number as missing" do
      push({ observations: { created: [ raw_observation("odd", observed_at: { "$date" => 1 }) ], updated: [], deleted: [] } })

      expect(rejected.sole).to include("id" => "odd", "reason" => "Observed at can't be blank")
    end

    it "takes the same new record twice at once as a create and then an update" do
      # The other request's row lands between this one's lookup and its insert
      lookups = 0
      allow(Observation).to receive(:find_or_initialize_by).and_wrap_original do |original, **attributes|
        record = original.call(**attributes)
        create(:observation, id: "twice", member: member, note: "first") if (lookups += 1) == 1
        record
      end

      push({ observations: { created: [ raw_observation("twice", note: "second") ], updated: [], deleted: [] } })

      expect(rejected).to eq([])
      expect(Observation.find("twice").note).to eq("second")
    end

    describe "with a payload that isn't the protocol's shape" do
      def push_raw(body)
        post "/api/v1/sync", params: body, headers: auth_headers(member), as: :json
      end

      it "answers 422, never 500" do
        [
          { changes: [ 1, 2 ] }, { changes: "everything" }, {},
          { changes: { observations: [ raw_observation("a") ] } },
          { changes: { observations: { created: "abc123" } } },
          { changes: { observations: { created: [ "abc123" ] } } },
          { changes: { rides: { deleted: { id: "ride1" } } } }
        ].each do |body|
          push_raw(body)

          expect(response).to have_http_status(:unprocessable_content), "#{body} gave #{response.status}"
          expect(json["error"]).to be_present
        end
        expect(Observation.count).to eq(0)
      end

      it "takes an empty push" do
        push_raw({ changes: {} })

        expect(response).to have_http_status(:ok)
        expect(rejected).to eq([])
      end

      it "turns away a body past the size limit" do
        stub_const("Api::V1::SyncsController::MAX_PUSH_BYTES", 200)

        push({ observations: { created: [ raw_observation("big", note: "x" * 300) ], updated: [], deleted: [] } })

        expect(response).to have_http_status(:content_too_large)
        expect(Observation.count).to eq(0)
      end
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

      expect(response).to have_http_status(:ok)
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

      expect(rejected).to eq([ { "table" => "observations", "id" => "sneaky", "reason" => "Waypoint belongs to another ranch" } ])
      expect(Observation.exists?("sneaky")).to be(false)
    end

    it "rejects an observation at a place the server has never seen, rather than hitting the foreign key" do
      push({ observations: { created: [ raw_observation("lost", waypoint_id: "nowhere"), raw_observation("found") ], updated: [], deleted: [] } })

      expect(response).to have_http_status(:ok)
      expect(rejected).to eq([ { "table" => "observations", "id" => "lost", "reason" => "Waypoint isn't a place the server knows" } ])
      expect(Observation.pluck(:id)).to eq([ "found" ])
    end

    it "rejects a place whose name or note is too long" do
      push({ waypoints: { created: [ raw_waypoint("longname", name: "x" * 81), raw_waypoint("longnote", note: "x" * 2001) ], updated: [], deleted: [] } })

      expect(rejected.pluck("id")).to eq(%w[longname longnote])
      expect(Waypoint.count).to eq(0)
    end

    it "refuses to rename another ranch's place" do
      outsider = create(:waypoint)

      push({ waypoints: { created: [], updated: [ raw_waypoint(outsider.id, name: "Mine") ], deleted: [] } })

      expect(rejected.sole).to include("table" => "waypoints", "id" => outsider.id)
      expect(outsider.reload.name).not_to eq("Mine")
    end

    it "lets any hand rename or move a place" do
      waypoint = create(:waypoint, member: member)
      hand = create(:member, ranch: ranch, role: "hand")

      push({ waypoints: { created: [], updated: [ raw_waypoint(waypoint.id, name: "Creek tank", latitude: 44.4402) ], deleted: [] } }, as: hand)

      expect(waypoint.reload).to have_attributes(name: "Creek tank", latitude: BigDecimal("44.4402"), member: member)
    end

    it "lets an owner delete a place and keeps the checks made there" do
      waypoint = create(:waypoint, member: member)
      check = create(:observation, member: member, kind: "water_check", waypoint: waypoint)
      owner = create(:member, ranch: ranch, role: "owner")

      push({ waypoints: { created: [], updated: [], deleted: [ waypoint.id ] } }, as: owner)

      expect(waypoint.reload.deleted_at).to be_present
      expect(check.reload.deleted_at).to be_nil
    end

    it "ignores a hand's delete and sends the place back on the next pull" do
      waypoint = create(:waypoint, member: member, updated_at: 1.hour.ago)
      hand = create(:member, ranch: ranch, role: "hand")
      last_pulled_at = to_ms(10.minutes.ago)

      push({ waypoints: { created: [], updated: [], deleted: [ waypoint.id ] } }, as: hand)

      expect(response).to have_http_status(:ok)
      expect(waypoint.reload.deleted_at).to be_nil
      pull(last_pulled_at, as: hand)
      expect(json.dig("changes", "waypoints", "updated").pluck("id")).to eq([ waypoint.id ])
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

    it "keeps sending a removed hand, marked removed, so their pins keep their name" do
      sam = create(:member, ranch: ranch, name: "Sam", removed_at: 1.day.ago)

      pull(to_ms(1.minute.ago))

      expect(json.dig("changes", "members", "updated")).to contain_exactly(
        { "id" => member.id.to_s, "name" => member.name, "role" => "hand", "removed" => false },
        { "id" => sam.id.to_s, "name" => "Sam", "role" => "hand", "removed" => true }
      )
    end
  end

  describe "resolving" do
    def resolve(observation, as:, **overrides)
      push({ observations: { created: [], updated: [ raw_observation(observation.id, status: "resolved", **overrides) ], deleted: [] } }, as: as)
    end

    it "credits whoever pushed it, at the time set on the phone" do
      observation = create(:observation, member: member)
      teammate = create(:member, ranch: ranch)

      resolve(observation, as: teammate, resolved_at: 1_791_100_000_000)

      expect(observation.reload).to have_attributes(status: "resolved", resolved_by: teammate, resolved_at: Time.zone.at(1_791_100_000))
      pull
      expect(json.dig("changes", "observations", "created").sole).to include("resolved_at" => 1_791_100_000_000, "resolved_by_id" => teammate.id.to_s)
    end

    it "ignores who the phone says resolved it" do
      observation = create(:observation, member: member)
      teammate = create(:member, ranch: ranch)

      resolve(observation, as: member, resolved_by_id: teammate.id.to_s)
      expect(observation.reload.resolved_by).to eq(member)

      other = create(:observation, member: member)
      resolve(other, as: member, resolved_by_id: create(:member).id.to_s)
      expect(rejected).to eq([])
      expect(other.reload.resolved_by).to eq(member)

      unknown = create(:observation, member: member)
      resolve(unknown, as: member, resolved_by_id: "987654321")
      expect(unknown.reload.resolved_by).to eq(member)
    end

    it "stamps the time itself when the phone sends none" do
      observation = create(:observation, member: member)

      freeze_time do
        resolve(observation, as: member)

        expect(observation.reload.resolved_at).to eq(Time.current)
      end
    end

    it "credits the pusher of a record that arrives already resolved" do
      push({ observations: { created: [ raw_observation("done1", status: "resolved", resolved_at: 1_791_100_000_000) ], updated: [], deleted: [] } })

      expect(Observation.find("done1")).to have_attributes(resolved_by: member, resolved_at: Time.zone.at(1_791_100_000))
    end

    it "keeps the first resolver when someone else edits it afterwards" do
      teammate = create(:member, ranch: ranch)
      observation = create(:observation, member: member, status: "resolved", resolved_by: teammate, resolved_at: Time.zone.at(1_791_100_000))

      resolve(observation, as: member, note: "Vet came Tuesday", resolved_at: 1_791_200_000_000)

      expect(observation.reload).to have_attributes(note: "Vet came Tuesday", resolved_by: teammate, resolved_at: Time.zone.at(1_791_100_000))
    end

    it "clears who and when on reopening" do
      observation = create(:observation, member: member, status: "resolved", resolved_by: member, resolved_at: 1.hour.ago)

      push({ observations: { created: [], updated: [ raw_observation(observation.id, status: "open", resolved_at: 1_791_100_000_000, resolved_by_id: member.id.to_s) ], deleted: [] } })

      expect(observation.reload).to have_attributes(status: "open", resolved_by: nil, resolved_at: nil)
    end
  end

  describe "merging by field" do
    let(:teammate) { create(:member, ranch: ranch, name: "Sam") }
    let(:observation) { create(:observation, member: member, note: "Limping", tag_number: "1234") }

    def update(raw, as: member, table: :observations)
      push({ table => { created: [], updated: [ raw ], deleted: [] } }, as: as)
    end

    # What a phone that last synced the untouched observation would send, with its own edits on top
    def stale(**edits)
      raw_observation(observation.id, note: "Limping", status: "open", **edits)
    end

    it "keeps a teammate's resolve when a note typed offline arrives after it" do
      update(stale(status: "resolved", resolved_at: 1_791_100_000_000, _changed: [ "status" ]), as: teammate)
      update(stale(note: "Left hind, getting worse", _changed: [ "note" ]))

      expect(rejected).to eq([])
      expect(observation.reload).to have_attributes(
        note: "Left hind, getting worse", status: "resolved", resolved_by: teammate, resolved_at: Time.zone.at(1_791_100_000)
      )
    end

    it "comes out the same when the note arrives first" do
      update(stale(note: "Left hind, getting worse", _changed: [ "note" ]))
      update(stale(status: "resolved", resolved_at: 1_791_100_000_000, _changed: [ "status" ]), as: teammate)

      expect(observation.reload).to have_attributes(
        note: "Left hind, getting worse", status: "resolved", resolved_by: teammate, resolved_at: Time.zone.at(1_791_100_000)
      )
    end

    it "applies only the named fields, leaving the rest as the server has them" do
      update(raw_observation(observation.id, note: "New note", tag_number: "9999", kind: "other", latitude: 1.5, _changed: %w[note kind]))

      expect(observation.reload).to have_attributes(note: "New note", kind: "other", tag_number: "1234", latitude: BigDecimal("44.43"))
    end

    it "lets the server decide who resolved it, whatever the list names" do
      update(stale(status: "resolved", resolved_by_id: teammate.id.to_s, _changed: %w[status resolved_by_id resolved_at]))
      expect(observation.reload).to have_attributes(status: "resolved", resolved_by: member)

      # Naming only the resolver fields changes nothing
      update(stale(status: "open", resolved_at: nil, resolved_by_id: nil, _changed: %w[resolved_at resolved_by_id]), as: teammate)
      expect(observation.reload).to have_attributes(status: "resolved", resolved_by: member, resolved_at: be_present)

      update(stale(status: "open", _changed: [ "status" ]), as: teammate)
      expect(observation.reload).to have_attributes(status: "open", resolved_by: nil, resolved_at: nil)
    end

    it "does nothing, and tells no other phone, when the list is empty or names nothing it knows" do
      observation.update_columns(updated_at: 1.hour.ago)

      expect {
        update(stale(note: "ignored", _changed: []))
        update(stale(note: "ignored", _changed: [ "ranch_id", "member_id", "id", "nonsense", 7, nil ]))
      }.not_to(change { observation.reload.attributes })

      expect(response).to have_http_status(:ok)
      expect(rejected).to eq([])
    end

    it "still rejects a named field that is invalid, and only that record" do
      update(stale(kind: "ufo", note: "kept out", _changed: %w[kind note]))

      expect(rejected).to eq([ { "table" => "observations", "id" => observation.id, "reason" => "Kind is not included in the list" } ])
      expect(observation.reload).to have_attributes(kind: "sick_animal", note: "Limping")
    end

    it "applies the whole record when there is no list, or an older app's counter in its place" do
      update(stale(note: "Whole", tag_number: "77").except(:_changed))
      expect(observation.reload).to have_attributes(note: "Whole", tag_number: "77")

      update(stale(note: "Counter", tag_number: "88", _changed: 3))
      expect(observation.reload).to have_attributes(note: "Counter", tag_number: "88")
    end

    it "takes an update for a record the server never got as a create, whole" do
      update(raw_observation("neverseen", note: "First time here", _changed: [ "note" ]))

      expect(rejected).to eq([])
      expect(Observation.find("neverseen")).to have_attributes(note: "First time here", kind: "sick_animal", tag_number: "1234", member: member)
    end

    it "applies a created record whole even with a list" do
      push({ observations: { created: [ raw_observation(observation.id, note: "Again", tag_number: "55", _changed: [ "note" ]) ], updated: [], deleted: [] } })

      expect(observation.reload).to have_attributes(note: "Again", tag_number: "55")
    end

    it "merges places and rides the same way" do
      waypoint = create(:waypoint, member: member, name: "North tank", note: "Float sticks")
      ride = Ride.create!(id: "ride1", ranch: ranch, member: member, started_at: 2.hours.ago, ended_at: 1.hour.ago, distance_meters: 100, track: [ [ -104.38, 44.43 ] ])

      update({ id: waypoint.id, kind: "gate", name: "Creek tank", latitude: 1.0, longitude: 1.0, note: nil, _changed: [ "name" ] }, table: :waypoints)
      update({ id: "ride1", started_at: 1, ended_at: 2, distance_meters: 5, name: "Fence check", track: "[]", _changed: [ "name" ] }, table: :rides)

      expect(rejected).to eq([])
      expect(waypoint.reload).to have_attributes(name: "Creek tank", kind: "water", note: "Float sticks", latitude: BigDecimal("44.43"))
      expect(ride.reload).to have_attributes(name: "Fence check", distance_meters: 100, track: [ [ -104.38, 44.43 ] ])
    end

    it "leaves a photo where it is unless its observation is named" do
      photo = create(:photo, observation: observation)
      other = create(:observation, member: member)

      update({ id: photo.id, observation_id: other.id, _changed: [ "uploaded_at" ] }, table: :photos)
      expect(photo.reload.observation).to eq(observation)

      update({ id: photo.id, observation_id: other.id, _changed: [ "observation_id" ] }, table: :photos)
      expect(photo.reload.observation).to eq(other)
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

      expect(response).to have_http_status(:ok)
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

      expect(rejected).to eq([ { "table" => "rides", "id" => "ride2", "reason" => "Track must be a list of [longitude, latitude] points" } ])
    end

    it "rejects a track that isn't JSON, and still takes the next ride" do
      push({ rides: { created: [ raw_ride("torn", track: "[[-104.38,44.4"), raw_ride("whole") ], updated: [], deleted: [] } })

      expect(response).to have_http_status(:ok)
      expect(rejected.sole).to include("table" => "rides", "id" => "torn", "reason" => "Track must be a list of [longitude, latitude] points")
      expect(Ride.pluck(:id)).to eq([ "whole" ])
    end

    it "keeps a ride whose clock was set back mid-ride, ending it when it started" do
      push({ rides: { created: [ raw_ride("clock", started_at: 1_791_003_600_000, ended_at: 1_791_000_000_000) ], updated: [], deleted: [] } })

      expect(rejected).to eq([])
      expect(Ride.find("clock")).to have_attributes(started_at: Time.zone.at(1_791_003_600), ended_at: Time.zone.at(1_791_003_600), track: [ [ -104.38, 44.43 ], [ -104.37, 44.44 ] ])
    end

    it "rejects a track with more points than a ride could have" do
      stub_const("Ride::MAX_TRACK_POINTS", 3)

      push({ rides: { created: [ raw_ride("long", track: ([ [ -104.38, 44.43 ] ] * 4).to_json), raw_ride("short", track: ([ [ -104.38, 44.43 ] ] * 3).to_json) ], updated: [], deleted: [] } })

      expect(rejected).to eq([ { "table" => "rides", "id" => "long", "reason" => "Track has more than 3 points" } ])
      expect(Ride.pluck(:id)).to eq([ "short" ])
    end

    it "rejects a ride name that is too long" do
      push({ rides: { created: [ raw_ride("named", name: "x" * 81) ], updated: [], deleted: [] } })

      expect(rejected.sole).to include("id" => "named", "reason" => "Name is too long (maximum is 80 characters)")
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
