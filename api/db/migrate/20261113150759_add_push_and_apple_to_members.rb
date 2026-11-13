class AddPushAndAppleToMembers < ActiveRecord::Migration[8.1]
  def change
    # Where to send "Jess logged a sick animal": the phone's own FCM or APNs token
    add_column :members, :push_token, :string
    add_column :members, :push_platform, :string
    # An owner who signed in with Apple, the way google_sub is one who used Google
    add_column :members, :apple_sub, :string
    add_index :members, :apple_sub, unique: true
  end
end
