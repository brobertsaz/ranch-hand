class Observation < ApplicationRecord
  include Syncable

  KINDS = %w[sick_animal feed_check water_check fence_issue gate_issue other].freeze

  belongs_to :ranch
  belongs_to :member
  belongs_to :waypoint, optional: true
  belongs_to :resolved_by, class_name: "Member", optional: true
  has_many :photos, dependent: :destroy

  # open: needs doing; resolved: was a problem, now handled; ok: a routine check that found nothing wrong
  enum :status, { open: "open", resolved: "resolved", ok: "ok" }, validate: true

  validates :id, presence: true
  validates :kind, inclusion: { in: KINDS }
  validates :latitude, numericality: { in: -90..90 }
  validates :longitude, numericality: { in: -180..180 }
  validates :observed_at, presence: true
  validates :tag_number, length: { maximum: 40 }
  validates :note, length: { maximum: Syncable::NOTE_LIMIT }
  validate :waypoint_on_same_ranch
  validate :resolver_on_same_ranch

  # resolved_by_id isn't here: the server credits whoever pushed the change (see SyncPush)
  CLIENT_FIELDS = %w[kind latitude longitude accuracy tag_number note status waypoint_id].freeze

  def self.attributes_from_raw(raw)
    raw.slice(*CLIENT_FIELDS).merge(
      observed_at: Syncable.from_ms(raw["observed_at"]),
      resolved_at: Syncable.from_ms(raw["resolved_at"])
    )
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
      waypoint_id: waypoint_id,
      resolved_at: Syncable.to_ms(resolved_at),
      resolved_by_id: resolved_by_id&.to_s
    }
  end

  # Its photos go with it, so other phones stop pulling them
  def soft_delete!
    transaction do
      super
      photos.live.find_each(&:soft_delete!)
    end
  end

  private

  def resolver_on_same_ranch
    errors.add(:resolved_by, "belongs to another ranch") if resolved_by && resolved_by.ranch_id != ranch_id
  end

  def waypoint_on_same_ranch
    return if waypoint_id.blank?
    # Without this an id the server has never seen would hit the foreign key and raise
    return errors.add(:waypoint, "isn't a place the server knows") unless waypoint
    errors.add(:waypoint, "belongs to another ranch") if waypoint.ranch_id != ranch_id
  end
end
