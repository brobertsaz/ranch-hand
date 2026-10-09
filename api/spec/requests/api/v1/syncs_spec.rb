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
