class AddWaypointToObservations < ActiveRecord::Migration[8.1]
  def change
    add_reference :observations, :waypoint, type: :string, foreign_key: true
  end
end
