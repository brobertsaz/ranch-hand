require "rails_helper"

RSpec.describe PushNotifier do
  let(:author) { create(:member, name: "Jess") }
  let(:ranch) { author.ranch }
  let!(:android) { create(:member, ranch: ranch, name: "Sam", push_platform: "android", push_token: "fcm-sam") }
  let!(:iphone) { create(:member, ranch: ranch, name: "Bob", push_platform: "ios", push_token: "apns-bob") }
  let(:sick) { create(:observation, member: author, tag_number: "1147", note: "Off feed — by the creek") }

  before do
    allow(Push::Fcm).to receive_messages(configured?: true, deliver: nil)
    allow(Push::Apns).to receive_messages(configured?: true, deliver: nil)
  end

  it "tells every other phone on the crew what was logged, by whom" do
    author.update!(push_platform: "android", push_token: "fcm-jess")
    create(:member, ranch: ranch, name: "No phone")
    create(:member, push_platform: "android", push_token: "fcm-other-ranch")
    create(:member, ranch: ranch, removed_at: 1.day.ago, push_platform: "android", push_token: "fcm-gone")

    described_class.logged(author: author, observations: [ sick ])

    message = described_class::Message.new(title: "Sick animal · Tag 1147 · Jess", body: "Off feed — by the creek", data: { observation_id: sick.id })
    expect(Push::Fcm).to have_received(:deliver).once.with("fcm-sam", message)
    expect(Push::Apns).to have_received(:deliver).once.with("apns-bob", message)
  end

  it "names the place when there's no tag, and the ranch when there's no note" do
    tank = create(:waypoint, member: author, kind: "water", name: "Water 3")
    low = create(:observation, member: author, kind: "water_check", waypoint: tank, note: nil)

    described_class.logged(author: author, observations: [ low ])

    expect(Push::Fcm).to have_received(:deliver).with("fcm-sam", have_attributes(title: "Water · Water 3 · Jess", body: "Open on Bob's Ranch"))
  end

  it "sends one message that counts them when a phone comes back with several" do
    fence = create(:observation, member: author, kind: "fence_issue")

    described_class.logged(author: author, observations: [ sick, fence ])

    expect(Push::Fcm).to have_received(:deliver).with("fcm-sam", have_attributes(title: "Jess logged 2 things", body: "Sick animal · Tag 1147, Fence", data: {}))
  end

  it "forgets a token the push service says is gone, and still reaches the others" do
    allow(Push::Fcm).to receive(:deliver).and_raise(described_class::TokenGone)

    described_class.logged(author: author, observations: [ sick ])

    expect(android.reload).to have_attributes(push_token: nil, push_platform: nil)
    expect(Push::Apns).to have_received(:deliver)
  end

  it "reports a sender that fails and carries on" do
    allow(Push::Fcm).to receive(:deliver).and_raise("FCM HTTP 500")
    allow(Rails.error).to receive(:report)

    described_class.logged(author: author, observations: [ sick ])

    expect(Rails.error).to have_received(:report).with(an_instance_of(RuntimeError), hash_including(handled: true))
    expect(android.reload.push_token).to eq("fcm-sam")
    expect(Push::Apns).to have_received(:deliver)
  end

  it "skips a platform this server has no key for" do
    allow(Push::Apns).to receive(:configured?).and_return(false)

    described_class.logged(author: author, observations: [ sick ])

    expect(Push::Apns).not_to have_received(:deliver)
    expect(Push::Fcm).to have_received(:deliver)
  end
end
