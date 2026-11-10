# The landing page's first step asks only for an email; the name comes with the optional questions
class AllowSignupsWithoutAName < ActiveRecord::Migration[8.1]
  def change
    change_column_null :signups, :name, true
  end
end
