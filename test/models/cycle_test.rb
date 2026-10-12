require "test_helper"

class CycleTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(email: "cycle@finansheet.local", password: "secret123")
  end

  test "open_cycle creates cycle 1 for a new account" do
    cycle = @user.open_cycle

    assert_equal 1, cycle.number
    assert_not cycle.closed?
    assert_in_delta Time.current, cycle.started_at, 5
  end

  test "open_cycle returns the existing open cycle" do
    first = @user.open_cycle

    assert_equal first, @user.open_cycle
    assert_equal 1, @user.cycles.count
  end

  test "open_cycle continues numbering after closed cycles" do
    @user.cycles.create!(number: 3, started_at: 2.months.ago, closed_at: 1.month.ago)

    assert_equal 4, @user.open_cycle.number
  end

  test "closed cycle is immutable" do
    cycle = @user.cycles.create!(number: 1, started_at: 2.months.ago, closed_at: 1.month.ago)

    assert_not cycle.update(expected_income: 10)
    assert_includes cycle.errors[:base], "registro fechado e imutável"
  end

  test "number is unique per user" do
    @user.cycles.create!(number: 1, started_at: Time.current)
    duplicate = @user.cycles.build(number: 1, started_at: Time.current, closed_at: Time.current)

    assert_not duplicate.valid?
  end
end
