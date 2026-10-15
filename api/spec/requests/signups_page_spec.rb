require "rails_helper"

RSpec.describe "Sign-ups page", type: :request do
  around do |example|
    previous = ENV["SIGNUPS_PASSWORD"]
    ENV["SIGNUPS_PASSWORD"] = "corral"
    example.run
  ensure
    ENV["SIGNUPS_PASSWORD"] = previous
  end

  let(:sign_in) { { "Authorization" => ActionController::HttpAuthentication::Basic.encode_credentials("bob", "corral") } }

  it "lists sign-ups newest first for the owner" do
    Signup.create!(name: "Jess", email: "jess@example.com", state: "Wyoming", created_at: 2.days.ago)
    Signup.create!(name: "Cody", email: "cody@example.com", head_count: "100-499")

    get "/signups", headers: sign_in

    expect(response).to have_http_status(:ok)
    expect(response.body).to include("2 sign-ups")
    expect(response.body.index("Cody")).to be < response.body.index("Jess")
  end

  it "asks for the password, and refuses a wrong one" do
    get "/signups"
    expect(response).to have_http_status(:unauthorized)

    get "/signups", headers: { "Authorization" => ActionController::HttpAuthentication::Basic.encode_credentials("bob", "wrong") }
    expect(response).to have_http_status(:unauthorized)
  end

  it "doesn't exist when no password is set" do
    ENV["SIGNUPS_PASSWORD"] = nil

    get "/signups", headers: sign_in

    expect(response).to have_http_status(:not_found)
  end
end
