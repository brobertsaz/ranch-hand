class AddPhoneToSignups < ActiveRecord::Migration[8.1]
  def change
    add_column :signups, :phone, :string
  end
end
