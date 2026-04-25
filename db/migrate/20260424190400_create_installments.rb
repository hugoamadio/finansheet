class CreateInstallments < ActiveRecord::Migration[8.1]
  def change
    create_table :installments, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.references :card_purchase, type: :uuid, null: false, foreign_key: true
      t.references :cycle,         type: :uuid, foreign_key: true
      t.integer    :number,    null: false
      t.decimal    :amount,    precision: 12, scale: 2, null: false
      t.date       :due_month, null: false
      t.timestamps
    end

    add_index :installments, [:card_purchase_id, :number], unique: true
    add_index :installments, :due_month

    add_check_constraint :installments,
      "number >= 1",
      name: "installments_number_positive"
  end
end
