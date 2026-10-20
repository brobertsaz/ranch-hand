class AddSourceToSignups < ActiveRecord::Migration[8.1]
  def change
    add_column :signups, :source, :string
  end
end
