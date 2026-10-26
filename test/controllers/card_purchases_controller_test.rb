require "test_helper"

class CardPurchasesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user  = User.create!(email: "ctrl@finansheet.local", password: "secret123")
    @card  = @user.cards.create!(name: "Nubank", mode: :credit, best_day: 29, pay_day: 7)
    @token = AuthToken.encode(user_id: @user.id)
    @auth  = { "Authorization" => "Bearer #{@token}" }

    @purchase = create_purchase(total: 1200, count: 4)
  end

  test "PATCH updates purchase and rebuilds installments" do
    patch "/api/cards/#{@card.id}/purchases/#{@purchase.id}",
          params: { purchase: { total_amount: 800, installments_count: 8 } },
          headers: @auth, as: :json

    assert_response :ok
    body = JSON.parse(response.body)
    assert_equal 8, body["purchase"]["installments_count"]
    assert_equal 8, body["purchase"]["installments"].size
    assert_equal 8, @purchase.reload.installments.count
  end

  test "PATCH 422 when purchase has a closed installment" do
    cycle = @user.cycles.create!(number: 99, started_at: 1.month.ago, closed_at: Time.current)
    @purchase.installments.first.update_columns(cycle_id: cycle.id)

    patch "/api/cards/#{@card.id}/purchases/#{@purchase.id}",
          params: { purchase: { total_amount: 50, installments_count: 1 } },
          headers: @auth, as: :json

    assert_response :unprocessable_entity
    assert JSON.parse(response.body)["errors"].any?
    assert_equal 4, @purchase.reload.installments_count
  end

  test "DELETE removes purchase" do
    delete "/api/cards/#{@card.id}/purchases/#{@purchase.id}", headers: @auth, as: :json

    assert_response :ok
    refute CardPurchase.exists?(@purchase.id)
  end

  test "DELETE 422 when purchase has a closed installment" do
    cycle = @user.cycles.create!(number: 99, started_at: 1.month.ago, closed_at: Time.current)
    @purchase.installments.first.update_columns(cycle_id: cycle.id)

    delete "/api/cards/#{@card.id}/purchases/#{@purchase.id}", headers: @auth, as: :json

    assert_response :unprocessable_entity
    assert CardPurchase.exists?(@purchase.id)
  end

  test "PATCH 404 when purchase belongs to other card" do
    other_card = @user.cards.create!(name: "Outro", mode: :credit, best_day: 5, pay_day: 12)
    patch "/api/cards/#{other_card.id}/purchases/#{@purchase.id}",
          params: { purchase: { total_amount: 800, installments_count: 4 } },
          headers: @auth, as: :json
    assert_response :not_found
  end

  test "requires auth" do
    delete "/api/cards/#{@card.id}/purchases/#{@purchase.id}", as: :json
    assert_response :unauthorized
  end

  test "POST puts the first installment in the open cycle and keeps third party" do
    post "/api/cards/#{@card.id}/purchases",
         params: { purchase: { description: "Fogão", total_amount: 300, installments_count: 3, third_party_name: "Mãe" } },
         headers: @auth, as: :json

    assert_response :created
    body = JSON.parse(response.body)["purchase"]
    assert_equal "Mãe", body["third_party_name"]
    assert_equal @user.open_cycle.number, body["installments"].first["cycle_number"]
  end

  test "PATCH third_party sets and clears the name even with a closed installment" do
    cycle = @user.cycles.create!(number: 99, started_at: 1.month.ago, closed_at: Time.current)
    @purchase.installments.first.update_columns(cycle_id: cycle.id)

    patch "/api/cards/#{@card.id}/purchases/#{@purchase.id}/third_party",
          params: { third_party_name: "Mãe" }, headers: @auth, as: :json
    assert_response :ok
    assert_equal "Mãe", @purchase.reload.third_party_name

    patch "/api/cards/#{@card.id}/purchases/#{@purchase.id}/third_party",
          params: { third_party_name: "" }, headers: @auth, as: :json
    assert_nil @purchase.reload.third_party_name
  end

  test "PATCH third_party splits the purchase and clearing the name resets the share" do
    patch "/api/cards/#{@card.id}/purchases/#{@purchase.id}/third_party",
          params: { third_party_name: "Beatriz", third_party_percent: 50 }, headers: @auth, as: :json
    assert_response :ok
    assert_equal 50, JSON.parse(response.body)["purchase"]["third_party_percent"]
    assert_equal [true, 50], [@purchase.reload.third_party?, @purchase.third_party_percent]

    patch "/api/cards/#{@card.id}/purchases/#{@purchase.id}/third_party",
          params: { third_party_name: "" }, headers: @auth, as: :json
    assert_equal [nil, 100], [@purchase.reload.third_party_name, @purchase.third_party_percent]
  end

  test "POST prepay and DELETE prepay" do
    post "/api/cards/#{@card.id}/purchases/#{@purchase.id}/prepay", headers: @auth, as: :json
    assert_response :ok
    assert_equal [@user.open_cycle.number], @purchase.reload.installments.distinct.pluck(:cycle_number)

    delete "/api/cards/#{@card.id}/purchases/#{@purchase.id}/prepay", headers: @auth, as: :json
    assert_response :ok
    assert_equal 4, @purchase.reload.installments.distinct.count(:cycle_number)
  end

  test "POST cancel_remaining refuses a closed installment and cancels an open one" do
    cycle = @user.cycles.create!(number: 99, started_at: 1.month.ago, closed_at: Time.current)
    @purchase.installments.where(number: 1).update_all(cycle_id: cycle.id)

    post "/api/cards/#{@card.id}/purchases/#{@purchase.id}/cancel_remaining",
         params: { from_number: 1 }, headers: @auth, as: :json
    assert_response :unprocessable_entity

    post "/api/cards/#{@card.id}/purchases/#{@purchase.id}/cancel_remaining",
         params: { from_number: 2 }, headers: @auth, as: :json
    assert_response :ok
    assert_equal 1, @purchase.reload.installments_count
    assert_equal 300.to_d, @purchase.total_amount
  end

  private

  def create_purchase(total:, count:)
    form = CardPurchaseForm.new(
      user: @user, card: @card, description: "Compra base",
      total_amount: total, installments_count: count,
    )
    form.save || raise(form.errors.full_messages.inspect)
    form.card_purchase
  end
end
