class AddInstallmentsToFixedExpenses < ActiveRecord::Migration[8.1]
  def change
    add_column :fixed_expenses, :installments_count, :integer
    add_column :fixed_expenses, :installments_paid,  :integer, default: 0, null: false
    add_column :fixed_expenses, :start_month,        :date

    add_check_constraint :fixed_expenses,
      "(installments_count IS NULL AND start_month IS NULL) OR " \
      "(installments_count IS NOT NULL AND start_month IS NOT NULL AND " \
      " installments_paid >= 0 AND installments_paid < installments_count)",
      name: "fixed_expenses_installments_consistency"
  end
end
