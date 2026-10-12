require "test_helper"

class Cycles::UndoTurnServiceTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(email: "undo@finansheet.local", password: "secret123")
    @card = @user.cards.create!(name: "Nubank", mode: :credit)
    @first = @user.open_cycle
    @first.update!(expected_income: 5000)
    buy(300, count: 3)
    @fixed = @user.fixed_expenses.create!(name: "Aluguel", amount: 750)
    @second = Cycles::TurnService.new(user: @user, cycle_id: @first.id).call
  end

  test "reopens the previous cycle and removes the new one" do
    reopened = undo!

    assert_equal @first.id, reopened.id
    assert_not reopened.reload.closed?
    assert_equal 0.to_d, reopened.total_own_cards
    assert_not Cycle.exists?(@second.id)
    assert_equal 0, Installment.where.not(cycle_id: nil).count
    assert_equal 0, FixedExpensePayment.where(cycle_number: @second.number).count
    assert_equal 1, FixedExpensePayment.where(cycle_number: @first.number, cycle_id: nil).count
  end

  test "can turn again after undo" do
    undo!

    assert_equal @second.number, Cycles::TurnService.new(user: @user, cycle_id: @first.id).call.number
  end

  test "blocked once a purchase is registered in the new cycle" do
    travel 1.second
    buy(10)

    error = assert_raises(Cycles::UndoTurnService::NotAllowed) { undo! }
    assert_match "compra", error.message
    assert @first.reload.closed?
  end

  test "blocked once a fixed expense is paid in the new cycle" do
    @fixed.payments.find_by!(cycle_number: @second.number).update!(paid_at: Time.current)

    assert_raises(Cycles::UndoTurnService::NotAllowed) { undo! }
  end

  test "blocked once a card is checked in the new cycle" do
    @second.card_checks.create!(card: @card, checked_at: Time.current)

    assert_raises(Cycles::UndoTurnService::NotAllowed) { undo! }
  end

  test "blocked once the income of the new cycle is changed" do
    @second.update!(expected_income: 6000)

    error = assert_raises(Cycles::UndoTurnService::NotAllowed) { undo! }
    assert_match "renda", error.message
  end

  test "blocked once a fixed expense amount is adjusted in the new cycle" do
    @fixed.payments.find_by!(cycle_number: @second.number).update!(amount: 0)

    assert_raises(Cycles::UndoTurnService::NotAllowed) { undo! }
  end

  test "blocked once a fixed expense is created after the turn" do
    travel 1.second
    @user.fixed_expenses.create!(name: "Academia", amount: 100)

    error = assert_raises(Cycles::UndoTurnService::NotAllowed) { undo! }
    assert_match "conta fixa", error.message
    assert @first.reload.closed?
  end

  test "blocked once an installment is prepaid into the new cycle" do
    Purchases::PrepayService.new(card_purchase: @user.card_purchases.first).call

    assert_raises(Cycles::UndoTurnService::NotAllowed) { undo! }
  end

  test "not allowed when there is no previous turn" do
    fresh = User.create!(email: "fresh@finansheet.local", password: "secret123")

    assert_equal "não há virada para desfazer", Cycles::UndoTurnService.new(user: fresh).blocker
  end

  private

  def buy(total, count: 1)
    form = CardPurchaseForm.new(user: @user, card: @card, description: "X", total_amount: total, installments_count: count)
    form.save || raise(form.errors.full_messages.inspect)
    form.card_purchase
  end

  def undo!
    Cycles::UndoTurnService.new(user: @user).call
  end
end
