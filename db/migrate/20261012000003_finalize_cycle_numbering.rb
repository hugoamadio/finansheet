# Depois da conversão (20261012000002): aperta as regras novas no banco e
# remove o modelo "ciclo = mês". Irreversível — o backup do Task 0 é a volta.
class FinalizeCycleNumbering < ActiveRecord::Migration[8.1]
  def up
    change_column_null :cycles, :number, false
    change_column_null :cycles, :started_at, false
    add_index :cycles, [:user_id, :number], unique: true
    add_index :cycles, :user_id, unique: true, where: "closed_at IS NULL", name: "index_cycles_one_open_per_user"
    remove_index :cycles, name: "index_cycles_on_user_id_and_reference_month"
    remove_column :cycles, :reference_month
    remove_column :cycles, :total_expenses

    change_column_null :installments, :cycle_number, false
    remove_index :installments, name: "index_installments_on_due_month"
    remove_column :installments, :due_month
    add_index :installments, :cycle_number

    remove_column :card_purchases, :excluded_from_summary

    change_column_null :fixed_expense_payments, :cycle_number, false
    remove_index :fixed_expense_payments, name: "idx_on_fixed_expense_id_reference_month_07ef94a6f1"
    remove_column :fixed_expense_payments, :reference_month
    add_index :fixed_expense_payments, [:fixed_expense_id, :cycle_number], unique: true

    remove_column :fixed_expenses, :start_month
    add_check_constraint :fixed_expenses,
                         "installments_count IS NULL AND start_cycle_number IS NULL OR " \
                         "installments_count IS NOT NULL AND start_cycle_number IS NOT NULL AND " \
                         "installments_paid >= 0 AND installments_paid < installments_count",
                         name: "fixed_expenses_installments_consistency"

    drop_table :incomes
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end
