# Ciclo deixa de ser mês do calendário e vira período numerado entre viradas.
# Esta migration só ADICIONA estrutura (tudo anulável). A conversão dos dados
# vem na 20261012000002 e o aperto (NOT NULL, índices, remoção do velho) na
# 20261012000003.
class AddCycleNumbering < ActiveRecord::Migration[8.1]
  OLD_FIXED_EXPENSES_CHECK =
    "installments_count IS NULL AND start_month IS NULL OR " \
    "installments_count IS NOT NULL AND start_month IS NOT NULL AND " \
    "installments_paid >= 0 AND installments_paid < installments_count"

  def change
    change_table :cycles, bulk: true do |t|
      t.integer  :number
      t.datetime :started_at
      t.decimal  :expected_income,      precision: 12, scale: 2, default: "0.0", null: false
      t.decimal  :total_own_cards,      precision: 12, scale: 2, default: "0.0", null: false
      t.decimal  :total_third_party,    precision: 12, scale: 2, default: "0.0", null: false
      t.decimal  :total_fixed_expenses, precision: 12, scale: 2, default: "0.0", null: false
    end
    change_column_null :cycles, :reference_month, true

    change_table :installments, bulk: true do |t|
      t.integer  :cycle_number
      t.integer  :original_cycle_number
      t.datetime :reimbursed_at
    end
    change_column_null :installments, :due_month, true

    change_table :card_purchases, bulk: true do |t|
      t.text     :third_party_name
      t.datetime :cancelled_at
    end

    add_column :fixed_expenses, :start_cycle_number, :integer
    remove_check_constraint :fixed_expenses, OLD_FIXED_EXPENSES_CHECK,
                            name: "fixed_expenses_installments_consistency"

    add_column :fixed_expense_payments, :cycle_number, :integer
    change_column_null :fixed_expense_payments, :reference_month, true

    create_table :cycle_card_checks, id: :uuid do |t|
      t.references :cycle, type: :uuid, null: false, foreign_key: true
      t.references :card,  type: :uuid, null: false, foreign_key: true
      t.datetime :checked_at, null: false
      t.timestamps
    end
    add_index :cycle_card_checks, [:cycle_id, :card_id], unique: true
  end
end
