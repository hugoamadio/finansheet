class AddInstallmentsPaidToCardPurchases < ActiveRecord::Migration[8.1]
  def change
    add_column :card_purchases, :installments_paid, :integer, default: 0, null: false
    add_check_constraint :card_purchases,
      "installments_paid >= 0 AND installments_paid < installments_count",
      name: "card_purchases_installments_paid_lt_count"
  end
end
