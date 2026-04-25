class CreateCardPurchases < ActiveRecord::Migration[8.1]
  def change
    create_table :card_purchases, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.references :user,        type: :uuid, null: false, foreign_key: true
      t.references :card,        type: :uuid, null: false, foreign_key: true
      t.text       :description, null: false
      t.decimal    :total_amount,       precision: 12, scale: 2, null: false
      t.integer    :installments_count, null: false, default: 1
      t.date       :purchased_on,       null: false
      t.timestamps
    end

    add_check_constraint :card_purchases,
      "installments_count >= 1",
      name: "card_purchases_installments_count_positive"
  end
end
