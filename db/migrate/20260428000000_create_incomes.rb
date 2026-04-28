class CreateIncomes < ActiveRecord::Migration[8.1]
  def change
    create_table :incomes, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.references :user,            type: :uuid, null: false, foreign_key: true
      t.date       :reference_month, null: false
      t.decimal    :amount,          precision: 12, scale: 2, null: false
      t.timestamps
    end

    add_index :incomes, [:user_id, :reference_month], unique: true
    add_check_constraint :incomes, "amount >= 0", name: "incomes_amount_non_negative"
  end
end
