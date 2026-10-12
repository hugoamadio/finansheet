require "test_helper"

class CyclesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = User.create!(email: "cyc@finansheet.local", password: "secret123")
    @card = @user.cards.create!(name: "Nubank", mode: :credit)
    @auth = { "Authorization" => "Bearer #{AuthToken.encode(user_id: @user.id)}" }
  end

  test "a new account gets cycle 1 with live totals" do
    buy(80)

    get "/api/cycles", headers: @auth, as: :json

    assert_response :ok
    body = JSON.parse(response.body)
    assert_equal 1, body["open"]["number"]
    assert_equal 80.0, body["open"]["own_cards"]
    assert_equal [], body["closed"]
  end

  test "PATCH current updates expected income and rejects negatives" do
    patch "/api/cycles/current", params: { expected_income: 5000 }, headers: @auth, as: :json
    assert_response :ok
    assert_equal 5000.to_d, @user.open_cycle.expected_income

    patch "/api/cycles/current", params: { expected_income: -1 }, headers: @auth, as: :json
    assert_response :unprocessable_entity
  end

  test "POST turn twice with the same cycle id returns 409 the second time" do
    open = @user.open_cycle

    post "/api/cycles/current/turn", params: { cycle_id: open.id }, headers: @auth, as: :json
    assert_response :created
    assert_equal 2, JSON.parse(response.body)["cycle"]["number"]

    post "/api/cycles/current/turn", params: { cycle_id: open.id }, headers: @auth, as: :json
    assert_response :conflict
    assert_equal 2, @user.cycles.count
  end

  test "closed cycles appear with their snapshot" do
    open = @user.open_cycle
    open.update!(expected_income: 3000)
    buy(500)
    Cycles::TurnService.new(user: @user, cycle_id: open.id).call

    get "/api/cycles", headers: @auth, as: :json

    closed = JSON.parse(response.body)["closed"].first
    assert_equal 3000.0, closed["income"]
    assert_equal 500.0, closed["own_cards"]
    assert_equal 2500.0, closed["balance"]
  end

  test "POST undo explains why when not allowed, and reopens the last cycle when allowed" do
    post "/api/cycles/last/undo", headers: @auth, as: :json
    assert_response :unprocessable_entity
    assert_equal ["não há virada para desfazer"], JSON.parse(response.body)["errors"]

    Cycles::TurnService.new(user: @user, cycle_id: @user.open_cycle.id).call
    get "/api/cycles", headers: @auth, as: :json
    assert JSON.parse(response.body)["can_undo"]

    post "/api/cycles/last/undo", headers: @auth, as: :json
    assert_response :ok
    assert_equal 1, JSON.parse(response.body)["cycle"]["number"]
  end

  test "GET index includes the next 6 cycles" do
    get "/api/cycles", headers: @auth, as: :json

    upcoming = JSON.parse(response.body)["upcoming"]
    assert_equal (2..7).to_a, upcoming.map { |row| row["number"] }
  end

  private

  def buy(total)
    form = CardPurchaseForm.new(user: @user, card: @card, description: "X", total_amount: total, installments_count: 1)
    form.save || raise(form.errors.full_messages.inspect)
  end
end
