require "test_helper"

class CardInstallmentsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = User.create!(email: "inst@finansheet.local", password: "secret123")
    @card = @user.cards.create!(name: "Nubank", mode: :credit)
    @auth = { "Authorization" => "Bearer #{AuthToken.encode(user_id: @user.id)}" }
    @open = @user.open_cycle
    buy(300, count: 3)
    buy(50, third_party_name: "Mãe")
  end

  test "lists the open cycle with own, third party and future totals" do
    get "/api/cards/#{@card.id}/installments", headers: @auth, as: :json

    assert_response :ok
    body = JSON.parse(response.body)
    assert_equal @open.number, body["cycle"]
    assert_equal 150.0, body["cycle_total"]
    assert_equal 100.0, body["cycle_total_own"]
    assert_equal 200.0, body["future_total"]
    assert_equal 2, body["installments"].size
    assert_equal 50.0, body["installments"].find { |i| i["third_party_name"] == "Mãe" }["amount"]
    assert(body["installments"].all? { |i| i.key?("can_prepay") && i.key?("cancel_from") })
  end

  test "lists a future cycle" do
    get "/api/cards/#{@card.id}/installments?cycle=#{@open.number + 1}", headers: @auth, as: :json

    body = JSON.parse(response.body)
    assert_equal 100.0, body["cycle_total"]
    assert_equal 100.0, body["future_total"]
  end

  private

  def buy(total, count: 1, third_party_name: nil)
    form = CardPurchaseForm.new(user: @user, card: @card, description: "X", total_amount: total,
                                installments_count: count, third_party_name:)
    form.save || raise(form.errors.full_messages.inspect)
  end
end
