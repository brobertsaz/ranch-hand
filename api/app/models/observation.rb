class Observation < ApplicationRecord
  include Syncable

  KINDS = %w[sick_animal feed_check water_check fence_issue gate_issue other].freeze

  belongs_to :ranch
  belongs_to :member
  belongs_to :waypoint, optional: true
  has_many :photos, dependent: :destroy

  # open: needs doing; resolved: was a problem, now handled; ok: a routine check that found nothing wrong
  enum :status, { open: "open", resolved: "resolved", ok: "ok" }, validate: true

  validates :id, presence: true
  validates :kind, inclusion: { in: KINDS }
  validates :latitude, numericality: { in: -90..90 }
  validates :longitude, numericality: { in: -180..180 }
  validates :observed_at, presence: true
  validate :waypoint_on_same_ranch

  CLIENT_FIELDS = %w[kind latitude longitude accuracy tag_number note status waypoint_id].freeze

  def self.attributes_from_raw(raw)
    raw.slice(*CLIENT_FIELDS).merge(observed_at: Syncable.from_ms(raw["observed_at"]))
  end

  def to_raw
    {
      id: id,
      member_id: member_id.to_s,
      kind: kind,
      latitude: latitude.to_f,
      longitude: longitude.to_f,
      accuracy: accuracy,
      observed_at: Syncable.to_ms(observed_at),
      tag_number: tag_number,
      note: note,
      status: status,
      waypoint_id: waypoint_id
    }
  end

  private

  def waypoint_on_same_ranch
    errors.add(:waypoint, "belongs to another ranch") if waypoint && waypoint.ranch_id != ranch_id
  end
end
