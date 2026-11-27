FactoryBot.define do
  # About 200 by 170 m near Madison, WI, the same ground as the map_area factory
  factory :pasture do
    sequence(:id) { |n| "pas#{n.to_s.rjust(13, '0')}" }
    member
    ranch { member.ranch }
    sequence(:name) { |n| "Pasture #{n}" }
    outline { [ [ -89.4590, 43.0025 ], [ -89.4565, 43.0025 ], [ -89.4565, 43.0040 ], [ -89.4590, 43.0040 ], [ -89.4590, 43.0025 ] ] }
  end
end
