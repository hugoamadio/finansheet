class AddSalaryToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :salary_day,         :integer
    add_column :users, :salary_on_last_day, :boolean, null: false, default: false

    add_check_constraint :users,
      "salary_day IS NULL OR salary_day BETWEEN 1 AND 31",
      name: "users_salary_day_range"

    # Mutuamente exclusivos: dia fixo XOR último dia. "Não configurado"
    # é ambos vazios (salary_day NULL + salary_on_last_day FALSE).
    add_check_constraint :users,
      "NOT (salary_day IS NOT NULL AND salary_on_last_day = TRUE)",
      name: "users_salary_day_xor_last_day"
  end
end
