require "test_helper"

class UserTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(email: "test@finansheet.local", password: "secret123")
  end

  test "salary_configured? false when nothing is set" do
    refute @user.salary_configured?
  end

  test "salary_configured? true with salary_day" do
    @user.update!(salary_day: 5)
    assert @user.salary_configured?
  end

  test "salary_configured? true with salary_on_last_day" do
    @user.update!(salary_on_last_day: true)
    assert @user.salary_configured?
  end

  test "rejects salary_day out of range" do
    @user.salary_day = 0
    refute @user.valid?
    assert @user.errors[:salary_day].any?

    @user.salary_day = 32
    refute @user.valid?
    assert @user.errors[:salary_day].any?
  end

  test "rejects setting salary_day and salary_on_last_day together" do
    @user.salary_day = 10
    @user.salary_on_last_day = true
    refute @user.valid?
    assert @user.errors[:base].any?
  end

  test "salary_date_for returns nil when not configured" do
    assert_nil @user.salary_date_for(year: 2026, month: 4)
  end

  test "salary_date_for fixed day returns that day" do
    @user.update!(salary_day: 10)
    assert_equal Date.new(2026, 4, 10), @user.salary_date_for(year: 2026, month: 4)
  end

  test "salary_date_for fixed day clamps to last day when month is shorter" do
    @user.update!(salary_day: 31)
    # fevereiro 2026 não tem dia 31; cai pro último dia (28).
    assert_equal Date.new(2026, 2, 28), @user.salary_date_for(year: 2026, month: 2)
  end

  test "salary_date_for last_day flag returns end of month" do
    @user.update!(salary_on_last_day: true)
    assert_equal Date.new(2026, 2, 28), @user.salary_date_for(year: 2026, month: 2)
    assert_equal Date.new(2026, 4, 30), @user.salary_date_for(year: 2026, month: 4)
    assert_equal Date.new(2026, 1, 31), @user.salary_date_for(year: 2026, month: 1)
  end
end
