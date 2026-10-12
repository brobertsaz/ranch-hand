require "rails_helper"

RSpec.describe Signup do
  it "rejects answers the form never offers" do
    signup = described_class.new(name: "Jess", email: "jess@example.com", head_count: "lots", rides: "boat")

    expect(signup).not_to be_valid
    expect(signup.errors.attribute_names).to contain_exactly(:head_count, :rides)
  end
end
