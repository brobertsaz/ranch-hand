# Shared by every table the phones sync through WatermelonDB's pull/push protocol.
# Records are soft-deleted so a pull can tell other phones what disappeared.
module Syncable
  extend ActiveSupport::Concern

  included do
    scope :live, -> { where(deleted_at: nil) }
    scope :changed_since, ->(time) { live.where(updated_at: time..) }
    scope :deleted_since, ->(time) { where(deleted_at: time..) }
  end

  def soft_delete!
    update!(deleted_at: Time.current)
  end

  # Watermelon sends timestamps as epoch milliseconds
  def self.from_ms(ms)
    ms.present? ? Time.zone.at(ms.to_i / 1000r) : nil
  end

  def self.to_ms(time)
    time && (time.to_r * 1000).floor
  end
end
