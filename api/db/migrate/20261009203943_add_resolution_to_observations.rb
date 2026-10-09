class AddResolutionToObservations < ActiveRecord::Migration[8.1]
  def change
    # Set on the phone when someone marks it resolved, so it works with no signal
    add_column :observations, :resolved_at, :datetime
    add_reference :observations, :resolved_by, foreign_key: { to_table: :members }
  end
end
