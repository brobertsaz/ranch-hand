FactoryBot.define do
  factory :waypoint do
    sequence(:id) { |n| "way#{n.to_s.rjust(13, '0')}" }
    member
    ranch { member.ranch }
    kind { "water" }
    sequence(:name) { |n| "Water #{n}" }
    latitude { 44.43 }
    longitude { -104.38 }
  end
end
