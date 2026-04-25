class CreateCards < ActiveRecord::Migration[8.1]
  def change
    create_table :cards, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.text   :name
      t.text   :bank
      t.string :mode, null: false

      t.timestamps
    end

    add_check_constraint :cards,
      "mode IN ('credit', 'debit')",
      name: "cards_mode_check"
  end
end
