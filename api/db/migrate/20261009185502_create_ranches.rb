class CreateRanches < ActiveRecord::Migration[8.1]
  def change
    create_table :ranches do |t|
      t.string :name, null: false
      t.string :invite_code, null: false

      t.timestamps
    end
    add_index :ranches, :invite_code, unique: true
  end
end
