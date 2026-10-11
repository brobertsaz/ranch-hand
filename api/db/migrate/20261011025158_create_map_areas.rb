class CreateMapAreas < ActiveRecord::Migration[8.1]
  def change
    create_table :map_areas do |t|
      t.references :ranch, null: false, foreign_key: true
      t.string :name, null: false
      t.float :west, null: false
      t.float :south, null: false
      t.float :east, null: false
      t.float :north, null: false
      t.string :status, null: false, default: "pending"
      t.integer :tile_count, null: false, default: 0
      t.datetime :rendered_at
      t.string :error
      t.timestamps
    end
  end
end
