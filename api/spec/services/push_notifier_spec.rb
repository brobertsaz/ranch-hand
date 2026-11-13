require "rails_helper"

RSpec.describe PushNotifier do
  let(:author) { create(:member, name: "Jess") }
  let(:ranch) { author.ranch }
  let!(:android) { phone(create(:member, ranch: ranch, name: "Sam"), "android", "fcm-sam") }
  let!(:iphone) { phone(create(:member, ranch: ranch, name: "Bob"), "ios", "apns-bob") }
  let(:sick) { create(:observation, member: author, tag_number: "1147", note: "Off feed — by the creek") }

  # A phone signed in as that member, with notifications on
  def phone(member, platform, token)
    member.sign_in!.tap { |device| device.register_push!(platform: platform, token: token) }
  end

  before do
    allow(Push::Fcm).to receive_messages(configured?: true, deliver: nil)
    allow(Push::Apns).to receive_messages(configured?: true, deliver: nil)
  end

  it "tells every other phone on the crew what was logged, by whom" do
    phone(author, "android", "fcm-jess")
    create(:member, ranch: ranch, name: "No phone")
    create(:member, ranch: ranch, name: "Notifications off").sign_in!
    phone(create(:member), "android", "fcm-other-ranch")
    phone(create(:member, ranch: ranch, removed_at: 1.day.ago), "android", "fcm-gone")

    described_class.logged(author: author, observations: [ sick ])

    message = described_class::Message.new(title: "Sick animal · Tag 1147 · Jess", body: "Off feed — by the creek", data: { observation_id: sick.id })
    expect(Push::Fcm).to have_received(:deliver).once.with("fcm-sam", message)
    expect(Push::Apns).to have_received(:deliver).once.with("apns-bob", message)
  end

  it "reaches both of an owner's phones" do
    phone(iphone.member, "android", "fcm-bob-tablet")

    described_class.logged(author: author, observations: [ sick ])

    expect(Push::Fcm).to have_received(:deliver).with("fcm-bob-tablet", anything)
    expect(Push::Apns).to have_received(:deliver).with("apns-bob", anything)
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
