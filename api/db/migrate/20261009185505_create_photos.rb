class CreatePhotos < ActiveRecord::Migration[8.1]
  def change
    create_table :photos, id: :string do |t|
      t.references :ranch, null: false, foreign_key: true
      t.references :observation, type: :string, null: false, foreign_key: true
      t.datetime :uploaded_at
      t.datetime :deleted_at

      t.timestamps
    end
    add_index :photos, [ :ranch_id, :updated_at ]
  end
end
