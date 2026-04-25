# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_04_24_181500) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"
  enable_extension "pgcrypto"

  create_table "cards", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.text "bank"
    t.integer "best_day"
    t.datetime "created_at", null: false
    t.string "mode", null: false
    t.text "name"
    t.integer "pay_day"
    t.datetime "updated_at", null: false
    t.check_constraint "best_day IS NULL OR best_day >= 1 AND best_day <= 31", name: "cards_best_day_range"
    t.check_constraint "mode::text = ANY (ARRAY['credit'::character varying::text, 'debit'::character varying::text])", name: "cards_mode_check"
    t.check_constraint "pay_day IS NULL OR pay_day >= 1 AND pay_day <= 31", name: "cards_pay_day_range"
  end

  create_table "user_cards", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "card_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["card_id"], name: "index_user_cards_on_card_id"
    t.index ["user_id", "card_id"], name: "index_user_cards_on_user_id_and_card_id", unique: true
    t.index ["user_id"], name: "index_user_cards_on_user_id"
  end

  create_table "users", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.string "password_digest", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
  end

  add_foreign_key "user_cards", "cards"
  add_foreign_key "user_cards", "users"
end
