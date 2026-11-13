class AddPlanToRanches < ActiveRecord::Migration[8.0]
  def change
    add_column :ranches, :plan, :string, null: false, default: "free"
    # When a paid Pro plan runs out; null on a Pro ranch means no end date
    add_column :ranches, :pro_until, :datetime
  end
end
