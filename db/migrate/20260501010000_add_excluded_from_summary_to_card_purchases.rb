class AddExcludedFromSummaryToCardPurchases < ActiveRecord::Migration[8.1]
  def change
    add_column :card_purchases, :excluded_from_summary, :boolean,
               default: false, null: false
  end
end
