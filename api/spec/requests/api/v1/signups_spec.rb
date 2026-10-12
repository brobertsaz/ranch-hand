require "rails_helper"

RSpec.describe "Signups", type: :request do
  let(:answers) { { name: "Jess", email: " Jess@Example.com ", state: "Wyoming", head_count: "100-499", rides: "both" } }

  it "puts a ranch on the early-access list without a device token" do
    post "/api/v1/signups", params: { signup: answers }, as: :json

    expect(response).to have_http_status(:created)
    expect(Signup.sole).to have_attributes(name: "Jess", email: "jess@example.com", head_count: "100-499", rides: "both")
  end

  it "updates the answers when the same email signs up again" do
    post "/api/v1/signups", params: { signup: answers }, as: :json
    post "/api/v1/signups", params: { signup: answers.merge(email: "jess@example.com", rides: "horse") }, as: :json

    expect(response).to have_http_status(:created)
    expect(Signup.sole.rides).to eq("horse")
  end

  it "rejects a sign-up without a working email" do
    post "/api/v1/signups", params: { signup: answers.merge(email: "jess") }, as: :json

    expect(response).to have_http_status(:unprocessable_content)
    expect(Signup.count).to eq(0)
  end
end
