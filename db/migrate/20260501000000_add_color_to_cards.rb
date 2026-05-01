class AddColorToCards < ActiveRecord::Migration[8.1]
  def change
    add_column :cards, :color, :string, limit: 7
    add_check_constraint :cards,
      "color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'",
      name: "cards_color_hex_format"
  end
end
