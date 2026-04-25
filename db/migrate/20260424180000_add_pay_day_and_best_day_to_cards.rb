class AddPayDayAndBestDayToCards < ActiveRecord::Migration[8.1]
  def change
    add_column :cards, :pay_day, :date
    add_column :cards, :best_day, :date
  end
end
