require "test_helper"

class Cycles::ProjectionTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(email: "proj@finansheet.local", password: "secret123")
    @card = @user.cards.create!(name: "Nubank", mode: :credit)
    @open = @user.open_cycle
    @open.update!(expected_income: 5000)
  end

  test "sums what is already committed in each of the next cycles" do
    buy(300, count: 3)
    buy(200, count: 2, third_party_name: "Mãe")
    @user.fixed_expenses.create!(name: "Aluguel", amount: 750)
    @user.fixed_expenses.create!(name: "TV", amount: 200, installments_count: 3, installments_paid: 1,
                                 start_cycle_number: @open.number)
    @user.fixed_expenses.create!(name: "Antiga", amount: 99, active: false)

    rows = Cycles::Projection.new(user: @user, count: 3).call

    assert_equal [@open.number + 1, @open.number + 2, @open.number + 3], rows.map(&:number)
    assert_equal 100.to_d,  rows.first.own_cards
    assert_equal 100.to_d,  rows.first.third_party
    assert_equal 950.to_d,  rows.first.fixed_expenses # aluguel + TV 3/3
    assert_equal 5000.to_d, rows.first.expected_income
    assert_equal 3950.to_d, rows.first.balance
    assert_equal 750.to_d,  rows.second.fixed_expenses # TV acabou
    assert_equal 0.to_d,    rows.third.own_cards
  end

  test "is read only" do
    @user.fixed_expenses.create!(name: "Aluguel", amount: 750)

    assert_no_difference("FixedExpensePayment.count") { Cycles::Projection.new(user: @user).call }
  end

  private

  def buy(total, count:, third_party_name: nil)
    form = CardPurchaseForm.new(user: @user, card: @card, description: "X", total_amount: total,
                                installments_count: count, third_party_name:)
    form.save || raise(form.errors.full_messages.inspect)
  end
end
