require "rails_helper"

RSpec.describe Ranch do
  describe "#unlimited_hands?" do
    it "is false on the free plan" do
      expect(build(:ranch)).not_to be_unlimited_hands
    end

    it "is true for a founding ranch, with or without an end date" do
      expect(build(:ranch, plan: :founding, pro_until: 1.year.ago)).to be_unlimited_hands
    end

    it "is true for Pro while it's paid up, or with no end date" do
      expect(build(:ranch, plan: :pro)).to be_unlimited_hands
      expect(build(:ranch, plan: :pro, pro_until: 1.day.from_now)).to be_unlimited_hands
    end

    it "is false for Pro once it has run out" do
      expect(build(:ranch, plan: :pro, pro_until: 1.minute.ago)).not_to be_unlimited_hands
    end
  end

  it "rejects a plan it doesn't know" do
    expect(build(:ranch, plan: "gold")).not_to be_valid
  end
end
