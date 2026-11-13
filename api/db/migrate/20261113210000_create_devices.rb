# One row per phone signed in as a member. The token used to live on the member, so an owner's phones all
# shared one that never changed; now each sign-in gets its own, and signing a phone out ends only that one.
class CreateDevices < ActiveRecord::Migration[8.1]
  def up
    create_table :devices do |t|
      t.references :member, null: false, foreign_key: true
      t.string :token, null: false
      # Where to send this phone the crew's news: its own FCM or APNs token
      t.string :push_token
      t.string :push_platform
      t.datetime :last_seen_at
      t.timestamps
      t.index :token, unique: true
    end

    execute <<~SQL
      INSERT INTO devices (member_id, token, push_token, push_platform, created_at, updated_at)
      SELECT id, device_token, push_token, push_platform, created_at, updated_at FROM members
    SQL

    remove_column :members, :device_token
    remove_column :members, :push_token
    remove_column :members, :push_platform
  end

  def down
    add_column :members, :device_token, :string
    add_column :members, :push_token, :string
    add_column :members, :push_platform, :string
    # A member with several phones keeps the newest one's token
    execute <<~SQL
      UPDATE members SET device_token = d.token, push_token = d.push_token, push_platform = d.push_platform
      FROM (SELECT DISTINCT ON (member_id) * FROM devices ORDER BY member_id, id DESC) d
      WHERE d.member_id = members.id
    SQL
    execute "UPDATE members SET device_token = md5(random()::text || id::text) WHERE device_token IS NULL"
    change_column_null :members, :device_token, false
    add_index :members, :device_token, unique: true
    drop_table :devices
  end
end
