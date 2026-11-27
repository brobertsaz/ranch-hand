class CreatePastures < ActiveRecord::Migration[8.1]
  def change
    # A fenced pasture, outlined by riding its fence. Ids come from the phone, like rides and waypoints.
    create_table :pastures, id: :string do |t|
      t.references :ranch, null: false, foreign_key: true
      t.references :member, null: false, foreign_key: true
      t.string :name, null: false
      # [[lng, lat], ...] around the fence, closed (the last point repeats the first)
      t.jsonb :outline, null: false, default: []
      t.datetime :deleted_at
      t.timestamps
    end
    add_index :pastures, %i[ranch_id updated_at]
  end
end
