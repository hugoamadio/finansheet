class CreateFixedExpenses < ActiveRecord::Migration[8.1]
  def change
    create_table :fixed_expenses, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.references :user,    type: :uuid, null: false, foreign_key: true
      t.text       :name,    null: false
      t.decimal    :amount,  precision: 12, scale: 2, null: false
      t.integer    :due_day
      t.boolean    :active,  null: false, default: true
      t.timestamps
    end

    add_check_constraint :fixed_expenses,
      "due_day IS NULL OR due_day BETWEEN 1 AND 31",
      name: "fixed_expenses_due_day_range"
  end
end
