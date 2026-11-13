require "rails_helper"

RSpec.describe Push::Apns do
  let(:message) { PushNotifier::Message.new(title: "Sick animal · Tag 1147 · Jess", body: "Off feed", data: { observation_id: "obs1" }) }
  let(:connection) { instance_double(Apnotic::Connection) }

  def answer(status, reason = nil)
    Apnotic::Response.new(headers: { ":status" => status }, body: reason ? { reason: reason }.to_json : "")
  end

  before do
    stub_const("ENV", ENV.to_h.merge("APNS_KEY" => "p8", "APNS_KEY_ID" => "KEY1", "APNS_TEAM_ID" => "TEAM1", "APNS_TOPIC" => "com.example.ranch"))
    allow(Apnotic::Connection).to receive(:new).and_return(connection)
    allow(connection).to receive(:push).and_return(answer("200"))
  end

  it "is only configured once the key, its ID and the team are all set" do
    expect(described_class).to be_configured

    stub_const("ENV", ENV.to_h.except("APNS_KEY_ID"))
    expect(described_class).not_to be_configured
  end

  it "sends an alert addressed to the app, with the observation to open" do
    described_class.deliver("apns-bob", message)

    expect(Apnotic::Connection).to have_received(:new).with(hash_including(auth_method: :token, key_id: "KEY1", team_id: "TEAM1"))
    expect(connection).to have_received(:push) do |notification, _options|
      expect(notification).to have_attributes(token: "apns-bob", topic: "com.example.ranch")
      expect(JSON.parse(notification.body)).to eq(
        "aps" => { "alert" => { "title" => "Sick animal · Tag 1147 · Jess", "body" => "Off feed" }, "sound" => "default" },
        "observation_id" => "obs1"
      )
    end
  end

  it "uses Apple's sandbox for development builds" do
    stub_const("ENV", ENV.to_h.merge("APNS_SANDBOX" => "1"))
    allow(Apnotic::Connection).to receive(:development).and_return(connection)

    described_class.deliver("apns-bob", message)

    expect(Apnotic::Connection).to have_received(:development)
  end

  it "says the token is gone when Apple says so" do
    allow(connection).to receive(:push).and_return(answer("410", "Unregistered"))
    expect { described_class.deliver("apns-bob", message) }.to raise_error(PushNotifier::TokenGone)

    allow(connection).to receive(:push).and_return(answer("400", "BadDeviceToken"))
    expect { described_class.deliver("apns-bob", message) }.to raise_error(PushNotifier::TokenGone)
  end

  it "raises on any other answer, and on none at all" do
    allow(connection).to receive(:push).and_return(answer("403", "InvalidProviderToken"))
    expect { described_class.deliver("apns-bob", message) }.to raise_error(RuntimeError, "APNs HTTP 403: InvalidProviderToken")

    allow(connection).to receive(:push).and_return(nil)
    expect { described_class.deliver("apns-bob", message) }.to raise_error(RuntimeError, "APNs didn't answer")
  end
end
