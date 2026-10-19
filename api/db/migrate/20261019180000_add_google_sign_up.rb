class AddGoogleSignUp < ActiveRecord::Migration[8.1]
  def change
    add_column :members, :email, :string
    add_column :members, :google_sub, :string
    add_index :members, :google_sub, unique: true

    add_column :ranches, :hand_limit, :integer, null: false, default: 3
  end
end
