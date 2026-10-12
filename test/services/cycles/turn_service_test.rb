require "test_helper"

class Cycles::TurnServiceTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(email: "turn@finansheet.local", password: "secret123")
    @card = @user.cards.create!(name: "Nubank", mode: :credit)
    @open = @user.open_cycle
    @open.update!(expected_income: 5000)
  end

  test "closes the open cycle with a snapshot and opens the next one" do
    buy(300, count: 3)
    buy(50, third_party_name: "Mãe")
    # Conta fixa sem pagamento gerado: o retrato tem que incluí-la mesmo assim.
    @user.fixed_expenses.create!(name: "Aluguel", amount: 750)

    next_cycle = turn!
    closed = @open.reload

    assert closed.closed?
    assert_equal 5000.to_d, closed.total_income
    assert_equal 100.to_d,  closed.total_own_cards
    assert_equal 50.to_d,   closed.total_third_party
    assert_equal 750.to_d,  closed.total_fixed_expenses
    assert_equal closed.number + 1, next_cycle.number
    assert_equal closed.closed_at, next_cycle.started_at
    assert_equal 5000.to_d, next_cycle.expected_income
  end

  test "binds the closed cycle items and leaves future installments open" do
    purchase = buy(300, count: 3)

    turn!

    assert_equal [true, false, false], purchase.installments.order(:number).map { |i| i.cycle_id.present? }
  end

  test "creates fixed expense payments for the new cycle" do
    fe = @user.fixed_expenses.create!(name: "Internet", amount: 90)

    next_cycle = turn!

    assert fe.payments.exists?(cycle_number: next_cycle.number)
  end

  test "turning the same cycle twice raises AlreadyTurned" do
    turn!

    assert_raises(Cycles::TurnService::AlreadyTurned) { turn! }
    assert_equal 1, @user.cycles.open.count
  end

  test "does not touch other users" do
    other_open = User.create!(email: "other-turn@finansheet.local", password: "secret123").open_cycle

    turn!

    assert_not other_open.reload.closed?
  end

  private

  def buy(total, count: 1, third_party_name: nil)
    form = CardPurchaseForm.new(user: @user, card: @card, description: "X", total_amount: total,
                                installments_count: count, third_party_name:)
    form.save || raise(form.errors.full_messages.inspect)
    form.card_purchase
  end

  def turn!
    Cycles::TurnService.new(user: @user, cycle_id: @open.id).call
  end
end
