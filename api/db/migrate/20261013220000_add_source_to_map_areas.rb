class AddSourceToMapAreas < ActiveRecord::Migration[8.1]
  def change
    # Areas made before state imagery all came from NAIP
    add_column :map_areas, :source, :string, null: false, default: "naip"
  end
end
