FactoryBot.define do
  factory :ranch do
    name { "Kara Creek" }
    sequence(:invite_code) { |n| "RANCH#{n}" }
  end
end
