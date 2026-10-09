class CreateMembers < ActiveRecord::Migration[8.1]
  def change
    create_table :members do |t|
      t.references :ranch, null: false, foreign_key: true
      t.string :name, null: false
      t.string :role, null: false, default: "hand"
      t.string :device_token, null: false

      t.timestamps
    end
    add_index :members, :device_token, unique: true
  end
end
