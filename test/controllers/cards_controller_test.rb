require "test_helper"

class CardsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = User.create!(email: "cards@finansheet.local", password: "secret123")
    @card = @user.cards.create!(name: "Nubank", mode: :credit, best_day: 5, pay_day: 12)
    @auth = { "Authorization" => "Bearer #{AuthToken.encode(user_id: @user.id)}" }
  end

  test "new account sees the open cycle 1 without errors" do
    get "/api/cards", headers: @auth, as: :json

    assert_response :ok
    cycle = JSON.parse(response.body)["cycle"]
    assert_equal 1, cycle["number"]
    assert_equal "open", cycle["status"]
    assert_equal 1, cycle["open_number"]
    assert_equal 7, cycle["max_number"]
  end

  test "closed and upcoming cycles report their status" do
    @user.cycles.create!(number: 1, started_at: 2.months.ago, closed_at: 1.month.ago, total_income: 4000)
    open = @user.open_cycle

    get "/api/cards?cycle=1", headers: @auth, as: :json
    closed = JSON.parse(response.body)["cycle"]
    assert_equal "closed", closed["status"]
    assert_equal 4000.0, closed["expected_income"]

    get "/api/cards?cycle=#{open.number + 1}", headers: @auth, as: :json
    assert_equal "upcoming", JSON.parse(response.body)["cycle"]["status"]
  end

  test "cycle out of range falls back to the open cycle" do
    get "/api/cards?cycle=999", headers: @auth, as: :json

    assert_equal 1, JSON.parse(response.body)["cycle"]["number"]
  end

  test "cards carry the checked flag of the viewed cycle" do
    @user.open_cycle.card_checks.create!(card: @card, checked_at: Time.current)

    get "/api/cards", headers: @auth, as: :json

    assert JSON.parse(response.body)["cards"].first["checked"]
  end

  test "DELETE removes a card that was checked in a cycle" do
    @user.open_cycle.card_checks.create!(card: @card, checked_at: Time.current)

    delete "/api/cards/#{@card.id}", headers: @auth, as: :json

    assert_response :ok
    assert_not Card.exists?(@card.id)
  end
end
