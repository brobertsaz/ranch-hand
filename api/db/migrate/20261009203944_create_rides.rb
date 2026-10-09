class CreateRides < ActiveRecord::Migration[8.1]
  def change
    # A finished ride; the phone keeps the points to itself until the hand taps Stop
    create_table :rides, id: :string do |t|
      t.references :ranch, null: false, foreign_key: true
      t.references :member, null: false, foreign_key: true
      t.datetime :started_at, null: false
      t.datetime :ended_at, null: false
      t.float :distance_meters, null: false, default: 0
      # GeoJSON LineString coordinates: [[lng, lat], ...]
      t.jsonb :track, null: false, default: []
      t.datetime :deleted_at

      t.timestamps
    end
    add_index :rides, [ :ranch_id, :updated_at ]
  end
end
