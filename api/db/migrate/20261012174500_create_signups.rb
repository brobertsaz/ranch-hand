class CreateSignups < ActiveRecord::Migration[8.1]
  def change
    create_table :signups do |t|
      t.string :name, null: false
      t.string :email, null: false, index: { unique: true }
      t.string :state
      t.string :head_count
      t.string :rides
      t.timestamps
    end
  end
end
