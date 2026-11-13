require "rails_helper"

RSpec.describe Push::Fcm do
  let(:message) { PushNotifier::Message.new(title: "Sick animal · Tag 1147 · Jess", body: "Off feed", data: { observation_id: "obs1" }) }
  let(:credentials) { instance_double(Google::Auth::ServiceAccountCredentials, needs_access_token?: false, access_token: "ya29.token") }

  def answer(klass, code, body = "{}")
    klass.new("1.1", code, "").tap { |response| allow(response).to receive(:body).and_return(body) }
  end

  before do
    stub_const("ENV", ENV.to_h.merge("FCM_SERVICE_ACCOUNT_JSON" => { project_id: "ranch-hand-512121" }.to_json))
    described_class.instance_variable_set(:@credentials, nil)
    allow(Google::Auth::ServiceAccountCredentials).to receive(:make_creds).and_return(credentials)
    allow(Net::HTTP).to receive(:post).and_return(answer(Net::HTTPOK, "200"))
  end

  it "is only configured once the service account key is set" do
    expect(described_class).to be_configured

    stub_const("ENV", ENV.to_h.except("FCM_SERVICE_ACCOUNT_JSON"))
    expect(described_class).not_to be_configured
  end

  it "posts a notification message for the phone's token to the project's send endpoint" do
    described_class.deliver("fcm-sam", message)

    expect(Net::HTTP).to have_received(:post) do |uri, body, headers|
      expect(uri.to_s).to eq("https://fcm.googleapis.com/v1/projects/ranch-hand-512121/messages:send")
      expect(headers).to include("Authorization" => "Bearer ya29.token")
      expect(JSON.parse(body)).to eq(
        "message" => {
          "token" => "fcm-sam",
          "notification" => { "title" => "Sick animal · Tag 1147 · Jess", "body" => "Off feed" },
          "data" => { "observation_id" => "obs1" },
          "android" => { "priority" => "high", "notification" => { "channel_id" => "crew" } }
        }
      )
    end
  end

  it "says the token is gone when FCM no longer knows it or calls it invalid" do
    allow(Net::HTTP).to receive(:post).and_return(answer(Net::HTTPNotFound, "404", { error: { status: "NOT_FOUND" } }.to_json))
    expect { described_class.deliver("fcm-sam", message) }.to raise_error(PushNotifier::TokenGone)

    invalid = { error: { status: "INVALID_ARGUMENT", message: "The registration token is not a valid FCM registration token" } }.to_json
    allow(Net::HTTP).to receive(:post).and_return(answer(Net::HTTPBadRequest, "400", invalid))
    expect { described_class.deliver("fcm-sam", message) }.to raise_error(PushNotifier::TokenGone)
  end

  it "raises on any other failure, so a bad payload or an outage isn't mistaken for a dead token" do
    allow(Net::HTTP).to receive(:post).and_return(answer(Net::HTTPBadRequest, "400", { error: { status: "INVALID_ARGUMENT", message: "Invalid JSON payload" } }.to_json))
    expect { described_class.deliver("fcm-sam", message) }.to raise_error(RuntimeError, /FCM HTTP 400/)

    allow(Net::HTTP).to receive(:post).and_return(answer(Net::HTTPServiceUnavailable, "503", "busy"))
    expect { described_class.deliver("fcm-sam", message) }.to raise_error(RuntimeError, /FCM HTTP 503/)
  end
end
