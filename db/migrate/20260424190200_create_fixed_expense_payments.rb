class CreateFixedExpensePayments < ActiveRecord::Migration[8.1]
  def change
    create_table :fixed_expense_payments, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.references :fixed_expense,   type: :uuid, null: false, foreign_key: true
      t.references :cycle,           type: :uuid, foreign_key: true
      t.decimal    :amount,          precision: 12, scale: 2, null: false
      t.date       :reference_month, null: false
      t.datetime   :paid_at
      t.timestamps
    end

    add_index :fixed_expense_payments, [:fixed_expense_id, :reference_month], unique: true
  end
end
