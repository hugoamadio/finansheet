require "test_helper"

class CardPurchaseFormTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(email: "test@finansheet.local", password: "secret123")
    @card = @user.cards.create!(name: "Nubank", bank: "Nubank", mode: :credit, best_day: 29, pay_day: 7)
  end

  test "creates purchase with N installments when buying before best_day" do
    form = CardPurchaseForm.new(
      user: @user,
      card: @card,
      description: "Celular novo",
      total_amount: 1440,
      installments_count: 8,
      purchased_on: Date.new(2026, 4, 24),
    )

    assert form.save, "expected form to save: #{form.errors.full_messages.inspect}"

    purchase = form.card_purchase
    assert_equal "Celular novo",        purchase.description
    assert_equal 8,                     purchase.installments_count
    assert_equal 1440,                  purchase.total_amount
    assert_equal Date.new(2026, 4, 24), purchase.purchased_on
    assert_equal 8,                     purchase.installments.count

    expected_due_months = (0..7).map { |i| Date.new(2026, 5, 1) >> i }
    assert_equal expected_due_months, purchase.installments.order(:number).pluck(:due_month)

    assert_equal [180] * 8, purchase.installments.order(:number).pluck(:amount).map(&:to_i)
  end

  test "puts division remainder on last installment" do
    form = CardPurchaseForm.new(
      user: @user,
      card: @card,
      description: "Pizza",
      total_amount: 100,
      installments_count: 3,
      purchased_on: Date.new(2026, 4, 24),
    )

    assert form.save, form.errors.full_messages.inspect

    amounts = form.card_purchase.installments.order(:number).pluck(:amount)
    assert_equal [33.33.to_d, 33.33.to_d, 33.34.to_d], amounts
    assert_equal 100.to_d, amounts.sum
  end

  test "purchase ON best_day still goes to next month" do
    form = CardPurchaseForm.new(
      user: @user, card: @card, description: "X",
      total_amount: 100, installments_count: 1,
      purchased_on: Date.new(2026, 4, 29), # exato best_day
    )
    assert form.save
    assert_equal Date.new(2026, 5, 1), form.card_purchase.installments.first.due_month
  end

  test "purchase AFTER best_day goes two months ahead" do
    form = CardPurchaseForm.new(
      user: @user, card: @card, description: "X",
      total_amount: 100, installments_count: 1,
      purchased_on: Date.new(2026, 4, 30), # após best_day=29
    )
    assert form.save
    assert_equal Date.new(2026, 6, 1), form.card_purchase.installments.first.due_month
  end

  test "single-installment purchase creates 1 installment with full amount" do
    form = CardPurchaseForm.new(
      user: @user, card: @card, description: "Camiseta",
      total_amount: 89.90, installments_count: 1,
      purchased_on: Date.new(2026, 4, 10),
    )
    assert form.save
    inst = form.card_purchase.installments.first
    assert_equal 89.90.to_d, inst.amount
    assert_equal 1, inst.number
  end

  test "fails when card has no best_day configured" do
    card_without_best_day = @user.cards.create!(name: "X", mode: :credit)
    form = CardPurchaseForm.new(
      user: @user, card: card_without_best_day, description: "Y",
      total_amount: 50, installments_count: 1,
      purchased_on: Date.current,
    )
    refute form.save
    assert_includes form.errors[:card], "deve ter best_day configurado"
  end

  test "validates required fields" do
    form = CardPurchaseForm.new
    refute form.save
    assert form.errors[:user].any?
    assert form.errors[:card].any?
    assert form.errors[:description].any?
    assert form.errors[:total_amount].any?
    assert form.errors[:installments_count].any?
    assert form.errors[:purchased_on].any?
  end

  test "validates positive total and installments_count" do
    form = CardPurchaseForm.new(
      user: @user, card: @card, description: "X",
      total_amount: 0, installments_count: 0,
      purchased_on: Date.current,
    )
    refute form.save
    assert form.errors[:total_amount].any?
    assert form.errors[:installments_count].any?
  end
end
