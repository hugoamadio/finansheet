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

ActiveRecord::Schema[8.1].define(version: 2026_05_01_030000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"
  enable_extension "pgcrypto"

  create_table "card_purchases", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "card_id", null: false
    t.datetime "created_at", null: false
    t.text "description", null: false
    t.boolean "excluded_from_summary", default: false, null: false
    t.integer "installments_count", default: 1, null: false
    t.integer "installments_paid", default: 0, null: false
    t.date "purchased_on", null: false
    t.decimal "total_amount", precision: 12, scale: 2, null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["card_id"], name: "index_card_purchases_on_card_id"
    t.index ["user_id"], name: "index_card_purchases_on_user_id"
    t.check_constraint "installments_count >= 1", name: "card_purchases_installments_count_positive"
    t.check_constraint "installments_paid >= 0 AND installments_paid < installments_count", name: "card_purchases_installments_paid_lt_count"
  end

  create_table "cards", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.text "bank"
    t.integer "best_day"
    t.string "color", limit: 7
    t.datetime "created_at", null: false
    t.string "mode", null: false
    t.text "name"
    t.integer "pay_day"
    t.datetime "updated_at", null: false
    t.check_constraint "best_day IS NULL OR best_day >= 1 AND best_day <= 31", name: "cards_best_day_range"
    t.check_constraint "color IS NULL OR color::text ~ '^#[0-9A-Fa-f]{6}$'::text", name: "cards_color_hex_format"
    t.check_constraint "mode::text = ANY (ARRAY['credit'::character varying::text, 'debit'::character varying::text])", name: "cards_mode_check"
    t.check_constraint "pay_day IS NULL OR pay_day >= 1 AND pay_day <= 31", name: "cards_pay_day_range"
  end

  create_table "cycles", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "closed_at"
    t.datetime "created_at", null: false
    t.date "reference_month", null: false
    t.decimal "total_expenses", precision: 12, scale: 2, default: "0.0", null: false
    t.decimal "total_income", precision: 12, scale: 2, default: "0.0", null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["user_id", "reference_month"], name: "index_cycles_on_user_id_and_reference_month", unique: true
    t.index ["user_id"], name: "index_cycles_on_user_id"
  end

  create_table "fixed_expense_payments", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.decimal "amount", precision: 12, scale: 2, null: false
    t.datetime "created_at", null: false
    t.uuid "cycle_id"
    t.uuid "fixed_expense_id", null: false
    t.datetime "paid_at"
    t.date "reference_month", null: false
    t.datetime "updated_at", null: false
    t.index ["cycle_id"], name: "index_fixed_expense_payments_on_cycle_id"
    t.index ["fixed_expense_id", "reference_month"], name: "idx_on_fixed_expense_id_reference_month_07ef94a6f1", unique: true
    t.index ["fixed_expense_id"], name: "index_fixed_expense_payments_on_fixed_expense_id"
  end

  create_table "fixed_expenses", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.decimal "amount", precision: 12, scale: 2, null: false
    t.datetime "created_at", null: false
    t.integer "due_day"
    t.integer "installments_count"
    t.integer "installments_paid", default: 0, null: false
    t.text "name", null: false
    t.date "start_month"
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["user_id"], name: "index_fixed_expenses_on_user_id"
    t.check_constraint "due_day IS NULL OR due_day >= 1 AND due_day <= 31", name: "fixed_expenses_due_day_range"
    t.check_constraint "installments_count IS NULL AND start_month IS NULL OR installments_count IS NOT NULL AND start_month IS NOT NULL AND installments_paid >= 0 AND installments_paid < installments_count", name: "fixed_expenses_installments_consistency"
  end

  create_table "incomes", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.decimal "amount", precision: 12, scale: 2, null: false
    t.datetime "created_at", null: false
    t.date "reference_month", null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["user_id", "reference_month"], name: "index_incomes_on_user_id_and_reference_month", unique: true
    t.index ["user_id"], name: "index_incomes_on_user_id"
    t.check_constraint "amount >= 0::numeric", name: "incomes_amount_non_negative"
  end

  create_table "installments", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.decimal "amount", precision: 12, scale: 2, null: false
    t.uuid "card_purchase_id", null: false
    t.datetime "created_at", null: false
    t.uuid "cycle_id"
    t.date "due_month", null: false
    t.integer "number", null: false
    t.datetime "updated_at", null: false
    t.index ["card_purchase_id", "number"], name: "index_installments_on_card_purchase_id_and_number", unique: true
    t.index ["card_purchase_id"], name: "index_installments_on_card_purchase_id"
    t.index ["cycle_id"], name: "index_installments_on_cycle_id"
    t.index ["due_month"], name: "index_installments_on_due_month"
    t.check_constraint "number >= 1", name: "installments_number_positive"
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
    t.integer "salary_day"
    t.boolean "salary_on_last_day", default: false, null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
    t.check_constraint "NOT (salary_day IS NOT NULL AND salary_on_last_day = true)", name: "users_salary_day_xor_last_day"
    t.check_constraint "salary_day IS NULL OR salary_day >= 1 AND salary_day <= 31", name: "users_salary_day_range"
  end

  add_foreign_key "card_purchases", "cards"
  add_foreign_key "card_purchases", "users"
  add_foreign_key "cycles", "users"
  add_foreign_key "fixed_expense_payments", "cycles"
  add_foreign_key "fixed_expense_payments", "fixed_expenses"
  add_foreign_key "fixed_expenses", "users"
  add_foreign_key "incomes", "users"
  add_foreign_key "installments", "card_purchases"
  add_foreign_key "installments", "cycles"
  add_foreign_key "user_cards", "cards"
  add_foreign_key "user_cards", "users"
end
