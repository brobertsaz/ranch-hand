require "rails_helper"

RSpec.describe "Members", type: :request do
  let(:owner) { create(:member, role: :owner, name: "Bob") }
  let(:ranch) { owner.ranch }
  let!(:hand) { create(:member, ranch: ranch, name: "Sam") }

  def remove(member, as: owner)
    delete "/api/v1/members/#{member.id}", headers: auth_headers(as)
  end

  it "lets the owner remove a hand, whose phone is then signed out" do
    observation = create(:observation, member: hand)

    remove(hand)

    expect(response).to have_http_status(:no_content)
    expect(hand.reload).to be_removed
    expect(observation.reload.member).to eq(hand)

    get "/api/v1/sync", headers: auth_headers(hand)
    expect(response).to have_http_status(:unauthorized)
    expect(json).to eq("error" => "removed")
  end

  it "hands back what the hand said they'd see to, and stops notifying their phone" do
    hand.register_push!(platform: "android", token: "fcm-token")
    open = create(:observation, member: owner, claimed_by: hand, claimed_at: 1.hour.ago, updated_at: 1.hour.ago)
    done = create(:observation, member: owner, status: "resolved", claimed_by: hand, claimed_at: 1.hour.ago)

    remove(hand)

    expect(open.reload).to have_attributes(claimed_by: nil, claimed_at: nil)
    expect(open.updated_at).to be_within(5.seconds).of(Time.current)
    expect(done.reload.claimed_by).to eq(hand)
    expect(hand.reload).to have_attributes(push_token: nil, push_platform: nil)
  end

  it "tells the rest of the crew on their next pull" do
    remove(hand)

    get "/api/v1/sync", params: { last_pulled_at: Syncable.to_ms(1.minute.from_now) }, headers: auth_headers(owner)

    expect(json.dig("changes", "members", "updated")).to include({ "id" => hand.id.to_s, "name" => "Sam", "role" => "hand", "removed" => true })
  end

  it "opens their spot on the free plan" do
    create_list(:member, 2, ranch: ranch)
    expect(ranch).to be_full

    remove(hand)

    expect(ranch.reload).not_to be_full
    get "/api/v1/ranch", headers: auth_headers(owner)
    expect(json).to include("hand_count" => 2, "hand_limit" => 3)
  end

  it "answers the same when the hand is already gone, without moving the date" do
    hand.update!(removed_at: Time.zone.at(1_791_000_000))

    remove(hand)

    expect(response).to have_http_status(:no_content)
    expect(hand.reload.removed_at).to eq(Time.zone.at(1_791_000_000))
  end

  it "is for the owner only" do
    remove(hand, as: create(:member, ranch: ranch))

    expect(response).to have_http_status(:forbidden)
    expect(hand.reload).not_to be_removed
  end

  it "won't remove another ranch's hand" do
    outsider = create(:member)

    remove(outsider)

    expect(response).to have_http_status(:not_found)
    expect(outsider.reload).not_to be_removed
  end

  it "won't let the owner remove themself" do
    remove(owner)

    expect(response).to have_http_status(:unprocessable_content)
    expect(owner.reload).not_to be_removed
  end

  it "404s a member that doesn't exist" do
    delete "/api/v1/members/0", headers: auth_headers(owner)

    expect(response).to have_http_status(:not_found)
  end
end
