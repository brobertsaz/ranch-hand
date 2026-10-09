class CreateWaypoints < ActiveRecord::Migration[8.1]
  def change
    # Persistent places (feed stations, tanks, gates); ids come from the phone like observations
    create_table :waypoints, id: :string do |t|
      t.references :ranch, null: false, foreign_key: true
      t.references :member, null: false, foreign_key: true
      t.string :kind, null: false
      t.string :name, null: false
      t.decimal :latitude, precision: 10, scale: 7, null: false
      t.decimal :longitude, precision: 10, scale: 7, null: false
      t.text :note
      t.datetime :deleted_at

      t.timestamps
    end
    add_index :waypoints, [ :ranch_id, :updated_at ]
  end
end
