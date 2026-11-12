# Shared by every table the phones sync through WatermelonDB's pull/push protocol.
# Records are soft-deleted so a pull can tell other phones what disappeared.
module Syncable
  extend ActiveSupport::Concern

  # Phones make their own ids (16 characters today); the cap keeps a bad client from storing essays as keys
  ID_LIMIT = 64
  # A phone's free text: a note typed in the field, not a document
  NOTE_LIMIT = 2000

  included do
    validates :id, length: { maximum: ID_LIMIT }

    scope :live, -> { where(deleted_at: nil) }
    scope :changed_since, ->(time) { live.where(updated_at: time..) }
    scope :deleted_since, ->(time) { where(deleted_at: time..) }
  end

  def soft_delete!
    update!(deleted_at: Time.current)
  end

  # Watermelon sends timestamps as epoch milliseconds
  def self.from_ms(ms)
    # Anything that isn't a number (or one as text) is treated as missing, so the record fails validation instead of raising
    return unless ms.is_a?(Numeric) || (ms.is_a?(String) && ms.present?)

    Time.zone.at(ms.to_i / 1000r)
  end

  def self.to_ms(time)
    time && (time.to_r * 1000).floor
  end
end
