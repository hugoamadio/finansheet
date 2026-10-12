require "test_helper"

class FixedExpenses::EnsurePaymentsForCycleTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(email: "fe@finansheet.local", password: "secret123")
    @open = @user.open_cycle
  end

  def ensure_for(number)
    FixedExpenses::EnsurePaymentsForCycle.new(user: @user, cycle_number: number).call
  end

  test "creates one payment per active recurring expense and is idempotent" do
    fe = @user.fixed_expenses.create!(name: "Aluguel", amount: 750)

    2.times { ensure_for(@open.number) }

    assert_equal [750.to_d], fe.payments.where(cycle_number: @open.number).pluck(:amount)
  end

  test "skips inactive expenses" do
    @user.fixed_expenses.create!(name: "Velha", amount: 10, active: false)

    ensure_for(@open.number)

    assert_equal 0, FixedExpensePayment.count
  end

  test "parceled expense advances one cycle at a time" do
    fe = @user.fixed_expenses.create!(name: "TV", amount: 200, installments_count: 7,
                                      installments_paid: 3, start_cycle_number: @open.number)

    assert_equal 4, FixedExpenses::EnsurePaymentsForCycle.installment_number_for(fe, @open.number)
    assert_equal 7, FixedExpenses::EnsurePaymentsForCycle.installment_number_for(fe, @open.number + 3)
    assert_nil FixedExpenses::EnsurePaymentsForCycle.installment_number_for(fe, @open.number + 4)

    ensure_for(@open.number + 4)
    assert_equal 0, fe.payments.count
  end

  test "does not create payments in a closed cycle" do
    @open.update!(closed_at: Time.current)
    @user.fixed_expenses.create!(name: "Aluguel", amount: 750)

    ensure_for(@open.number)

    assert_equal 0, FixedExpensePayment.count
  end
end
