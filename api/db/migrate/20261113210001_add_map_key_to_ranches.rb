# What a phone puts in the map style URL to get its ranch's sharp areas. It used to be the phone's own
# sign-in token, which then sat in MapLibre's caches and any proxy's logs.
class AddMapKeyToRanches < ActiveRecord::Migration[8.1]
  def up
    add_column :ranches, :map_key, :string
    execute "UPDATE ranches SET map_key = md5(random()::text || id::text) || md5(random()::text || name)"
    change_column_null :ranches, :map_key, false
    add_index :ranches, :map_key, unique: true
  end

  def down
    remove_column :ranches, :map_key
  end
end
