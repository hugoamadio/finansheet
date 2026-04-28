require "test_helper"

class IncomesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user  = User.create!(email: "inc@finansheet.local", password: "secret123")
    @token = AuthToken.encode(user_id: @user.id)
    @auth  = { "Authorization" => "Bearer #{@token}" }
  end

  test "GET 200 with nil amount when income not declared" do
    get "/api/incomes", params: { month: "2026-05-01" }, headers: @auth
    assert_response :ok
    assert_nil JSON.parse(response.body)["amount"]
  end

  test "GET 200 with the declared amount" do
    @user.incomes.create!(reference_month: Date.new(2026, 5, 1), amount: 4000)
    get "/api/incomes", params: { month: "2026-05-01" }, headers: @auth
    assert_response :ok
    assert_equal 4000.0, JSON.parse(response.body)["amount"]
  end

  test "PUT creates income for new month" do
    put "/api/incomes",
        params: { income: { reference_month: "2026-05-01", amount: 4000 } },
        headers: @auth, as: :json

    assert_response :ok
    assert_equal 4000.0, JSON.parse(response.body)["amount"]
    assert_equal 1, @user.incomes.count
  end

  test "PUT updates existing income (upsert)" do
    @user.incomes.create!(reference_month: Date.new(2026, 5, 1), amount: 3000)

    put "/api/incomes",
        params: { income: { reference_month: "2026-05-01", amount: 4500 } },
        headers: @auth, as: :json

    assert_response :ok
    assert_equal 4500.0, JSON.parse(response.body)["amount"]
    assert_equal 1, @user.incomes.count, "shouldn't create duplicate"
  end

  test "PUT 422 when month already closed" do
    @user.cycles.create!(reference_month: Date.new(2026, 4, 1), closed_at: Time.current)

    put "/api/incomes",
        params: { income: { reference_month: "2026-04-01", amount: 4000 } },
        headers: @auth, as: :json

    assert_response :unprocessable_entity
    assert_equal 0, @user.incomes.count
  end

  test "PUT 422 with negative amount" do
    put "/api/incomes",
        params: { income: { reference_month: "2026-05-01", amount: -100 } },
        headers: @auth, as: :json

    assert_response :unprocessable_entity
  end
end
