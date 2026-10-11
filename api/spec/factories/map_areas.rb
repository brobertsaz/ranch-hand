FactoryBot.define do
  # About 200 by 170 m near Madison, WI: 13 tiles at zoom 17-18
  factory :map_area do
    ranch
    sequence(:name) { |n| "Pasture #{n}" }
    west { -89.4590 }
    south { 43.0025 }
    east { -89.4565 }
    north { 43.0040 }
  end
end
