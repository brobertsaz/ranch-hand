class Waypoint < ApplicationRecord
  include Syncable

  KINDS = %w[feed water gate fence other].freeze

  belongs_to :ranch
  belongs_to :member
  has_many :observations, dependent: :nullify

  validates :id, :name, presence: true
  validates :kind, inclusion: { in: KINDS }
  validates :latitude, numericality: { in: -90..90 }
  validates :longitude, numericality: { in: -180..180 }

  CLIENT_FIELDS = %w[kind name latitude longitude note].freeze

  def self.attributes_from_raw(raw)
    raw.slice(*CLIENT_FIELDS)
  end

  def to_raw
    {
      id: id,
      member_id: member_id.to_s,
      kind: kind,
      name: name,
      latitude: latitude.to_f,
      longitude: longitude.to_f,
      note: note
    }
  end
end
