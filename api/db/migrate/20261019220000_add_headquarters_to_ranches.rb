class AddHeadquartersToRanches < ActiveRecord::Migration[8.1]
  def change
    add_column :ranches, :hq_lat, :float
    add_column :ranches, :hq_lng, :float
  end
end
