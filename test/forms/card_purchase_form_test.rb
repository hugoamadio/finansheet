require "test_helper"

class CardPurchaseFormTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(email: "test@finansheet.local", password: "secret123")
    @card = @user.cards.create!(name: "Nubank", bank: "Nubank", mode: :credit)
    @open = @user.open_cycle
  end

  def build(**attrs)
    CardPurchaseForm.new(user: @user, card: @card, description: "Celular novo",
                         total_amount: 1440, installments_count: 8, **attrs)
  end

  test "first installment goes to the open cycle, one per cycle after that" do
    form = build(purchased_on: Date.new(2026, 1, 15))

    assert form.save, form.errors.full_messages.inspect
    purchase = form.card_purchase
    assert_equal Date.new(2026, 1, 15), purchase.purchased_on
    assert_equal (@open.number..@open.number + 7).to_a, purchase.installments.order(:number).pluck(:cycle_number)
    assert_equal [180] * 8, purchase.installments.order(:number).pluck(:amount).map(&:to_i)
  end

  test "puts division remainder on last installment" do
    form = build(total_amount: 100, installments_count: 3)

    assert form.save
    amounts = form.card_purchase.installments.order(:number).pluck(:amount)
    assert_equal [33.33.to_d, 33.33.to_d, 33.34.to_d], amounts
  end

  test "with paid installments the next one lands in the open cycle" do
    form = build(total_amount: 1000, installments_count: 10, installments_paid: 9)

    assert form.save
    installment = form.card_purchase.installments.sole
    assert_equal 10, installment.number
    assert_equal @open.number, installment.cycle_number
    assert_equal 100.to_d, installment.amount
  end

  test "card without closing day accepts purchases" do
    assert build.save
  end

  test "saves third party name" do
    form = build(third_party_name: " Mãe ")

    assert form.save
    assert_equal "Mãe", form.card_purchase.third_party_name
  end

  test "purchased_on defaults to today" do
    form = build

    assert form.save
    assert_equal Date.current, form.card_purchase.purchased_on
  end

  test "validates required fields" do
    form = CardPurchaseForm.new(user: @user, card: @card)

    assert_not form.save
    assert form.errors[:description].any?
    assert form.errors[:total_amount].any?
  end

  test "validates paid installments range" do
    form = build(installments_count: 3, installments_paid: 3)

    assert_not form.save
    assert form.errors[:installments_paid].any?
  end
end
