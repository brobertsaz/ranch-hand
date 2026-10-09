FactoryBot.define do
  factory :observation do
    sequence(:id) { |n| "obs#{n.to_s.rjust(13, '0')}" }
    member
    ranch { member.ranch }
    kind { "sick_animal" }
    latitude { 44.43 }
    longitude { -104.38 }
    observed_at { Time.current }
  end
end
