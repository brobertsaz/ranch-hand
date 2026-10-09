class CreateObservations < ActiveRecord::Migration[8.1]
  def change
    # ids are generated on the phone by WatermelonDB, so records can exist offline before the server sees them
    create_table :observations, id: :string do |t|
      t.references :ranch, null: false, foreign_key: true
      t.references :member, null: false, foreign_key: true
      t.string :kind, null: false
      t.decimal :latitude, precision: 10, scale: 7, null: false
      t.decimal :longitude, precision: 10, scale: 7, null: false
      t.float :accuracy
      t.datetime :observed_at, null: false
      t.string :tag_number
      t.text :note
      t.string :status, null: false, default: "open"
      t.datetime :deleted_at

      t.timestamps
    end
    add_index :observations, [ :ranch_id, :updated_at ]
  end
end
