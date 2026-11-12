# A hand who leaves, or is removed by the owner, keeps their row so old pins still say who logged them
class AddRemovedAtToMembers < ActiveRecord::Migration[8.1]
  def change
    add_column :members, :removed_at, :datetime
  end
end
