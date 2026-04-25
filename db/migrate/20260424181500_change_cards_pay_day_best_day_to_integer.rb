class ChangeCardsPayDayBestDayToInteger < ActiveRecord::Migration[8.1]
  def up
    # Tabela está vazia ainda, então o USING NULL só força o cast — nada a migrar.
    change_column :cards, :pay_day,  :integer, using: "NULL"
    change_column :cards, :best_day, :integer, using: "NULL"

    add_check_constraint :cards,
      "pay_day IS NULL OR pay_day BETWEEN 1 AND 31",
      name: "cards_pay_day_range"

    add_check_constraint :cards,
      "best_day IS NULL OR best_day BETWEEN 1 AND 31",
      name: "cards_best_day_range"
  end

  def down
    remove_check_constraint :cards, name: "cards_best_day_range"
    remove_check_constraint :cards, name: "cards_pay_day_range"

    change_column :cards, :best_day, :date, using: "NULL"
    change_column :cards, :pay_day,  :date, using: "NULL"
  end
end
