# Compra dividida com outra pessoa: quanto da compra é dela (100 = tudo,
# 50 = metade). Só vale quando third_party_name está preenchido.
class AddThirdPartyPercentToCardPurchases < ActiveRecord::Migration[8.1]
  def change
    add_column :card_purchases, :third_party_percent, :integer, default: 100, null: false
    add_check_constraint :card_purchases, "third_party_percent BETWEEN 1 AND 100",
                         name: "card_purchases_third_party_percent_range"
  end
end
