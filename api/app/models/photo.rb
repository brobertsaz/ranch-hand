class Photo < ApplicationRecord
  include Syncable

  belongs_to :ranch
  belongs_to :observation
  has_one_attached :file

  validates :id, presence: true

  # The record syncs first; the image bytes follow when there is signal
  def attach_file!(upload)
    file.attach(upload)
    update!(uploaded_at: Time.current)
  end

  def to_raw
    {
      id: id,
      observation_id: observation_id,
      uploaded_at: Syncable.to_ms(uploaded_at)
    }
  end
end
