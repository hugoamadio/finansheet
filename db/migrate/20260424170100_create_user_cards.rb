class CreateUserCards < ActiveRecord::Migration[8.1]
  def change
    create_table :user_cards, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.references :user, type: :uuid, null: false, foreign_key: true
      t.references :card, type: :uuid, null: false, foreign_key: true

      t.timestamps
    end

    add_index :user_cards, [:user_id, :card_id], unique: true
  end
end
