require "test_helper"

class FixedExpensesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = User.create!(email: "fec@finansheet.local", password: "secret123")
    @auth = { "Authorization" => "Bearer #{AuthToken.encode(user_id: @user.id)}" }
    @open = @user.open_cycle
  end

  test "GET index lists payments of the open cycle" do
    @user.fixed_expenses.create!(name: "Internet", amount: 90)

    get "/api/fixed_expenses", headers: @auth, as: :json

    assert_response :ok
    body = JSON.parse(response.body)
    assert_equal @open.number, body["cycle"]
    assert body["editable"]
    assert_equal ["Internet"], body["items"].map { |i| i["name"] }
  end

  test "POST parceled expense starts in the open cycle" do
    post "/api/fixed_expenses",
         params: { fixed_expense: { name: "TV", amount: 200, installments_count: 7, installments_paid: 3 } },
         headers: @auth, as: :json

    assert_response :created
    fe = @user.fixed_expenses.last
    assert_equal @open.number, fe.start_cycle_number
    assert_equal 1, fe.payments.where(cycle_number: @open.number).count
  end

  test "PATCH payment outside the open cycle is refused" do
    fe = @user.fixed_expenses.create!(name: "Internet", amount: 90)
    future = fe.payments.create!(amount: 90, cycle_number: @open.number + 1)

    patch "/api/fixed_expense_payments/#{future.id}", params: { paid: true }, headers: @auth, as: :json

    assert_response :unprocessable_entity
    assert_nil future.reload.paid_at
  end

  test "PATCH payment accepts zero amount in the open cycle" do
    fe = @user.fixed_expenses.create!(name: "Faxineira", amount: 150)
    payment = fe.payments.create!(amount: 150, cycle_number: @open.number)

    patch "/api/fixed_expense_payments/#{payment.id}", params: { amount: 0 }, headers: @auth, as: :json

    assert_response :ok
    assert_equal 0.to_d, payment.reload.amount
  end
end
