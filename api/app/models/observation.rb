class Observation < ApplicationRecord
  include Syncable

  KINDS = %w[sick_animal feed_check water_check fence_issue gate_issue other].freeze
  # For a notification's title; the app has its own copy for its screens
  LABELS = {
    "sick_animal" => "Sick animal", "feed_check" => "Feed", "water_check" => "Water",
    "fence_issue" => "Fence", "gate_issue" => "Gate", "other" => "Needs a look"
  }.freeze

  belongs_to :ranch
  belongs_to :member
  belongs_to :waypoint, optional: true
  belongs_to :resolved_by, class_name: "Member", optional: true
  # "I've got it": the hand riding out to it, so two don't both go. Only means something while it's open.
  belongs_to :claimed_by, class_name: "Member", optional: true
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
    attributes = raw.slice(*CLIENT_FIELDS).merge(
      observed_at: Syncable.from_ms(raw["observed_at"]),
      resolved_at: Syncable.from_ms(raw["resolved_at"])
    )
    # An app from before claims sends no claim at all, which must not read as "nobody has it"
    return attributes unless raw.key?("claimed_by_id")

    # Only whether there is a claimer matters: the server puts the pusher's own id in its place (see SyncPush)
    attributes.merge(claimed_by_id: raw["claimed_by_id"].present? ? 0 : nil, claimed_at: Syncable.from_ms(raw["claimed_at"]))
  end

  # Open problems a hand had said they'd take, handed back when that hand leaves the crew
  def self.release_claims_of(member)
    open.where(claimed_by: member).update_all(claimed_by_id: nil, claimed_at: nil, updated_at: Time.current)
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
      resolved_by_id: resolved_by_id&.to_s,
      claimed_at: Syncable.to_ms(claimed_at),
      claimed_by_id: claimed_by_id&.to_s
    }
  end

  # "Sick animal · Tag 1147", "Water · Water 3"
  def headline
    [ LABELS.fetch(kind), tag_number.present? ? "Tag #{tag_number}" : waypoint&.name ].compact.join(" · ")
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
