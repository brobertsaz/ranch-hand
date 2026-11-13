class AddClaimToObservations < ActiveRecord::Migration[8.1]
  def change
    # "I've got it": who is riding out to an open problem, so two hands don't both go
    add_column :observations, :claimed_at, :datetime
    add_reference :observations, :claimed_by, foreign_key: { to_table: :members }
  end
end
