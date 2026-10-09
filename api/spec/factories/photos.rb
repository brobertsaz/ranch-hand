FactoryBot.define do
  factory :photo do
    sequence(:id) { |n| "pho#{n.to_s.rjust(13, '0')}" }
    observation
    ranch { observation.ranch }
  end
end
