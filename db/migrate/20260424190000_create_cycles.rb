class CreateCycles < ActiveRecord::Migration[8.1]
  def change
    create_table :cycles, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.references :user,            type: :uuid, null: false, foreign_key: true
      t.date       :reference_month, null: false
      t.datetime   :closed_at
      t.decimal    :total_income,    precision: 12, scale: 2, default: 0, null: false
      t.decimal    :total_expenses,  precision: 12, scale: 2, default: 0, null: false
      t.timestamps
    end

    add_index :cycles, [:user_id, :reference_month], unique: true
  end
end
