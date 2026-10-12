FactoryBot.define do
  factory :ranch do
    name { "Bob's Ranch" }
    sequence(:invite_code) { |n| "RANCH#{n}" }
  end
end
