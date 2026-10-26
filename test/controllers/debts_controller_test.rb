require "test_helper"

class DebtsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = User.create!(email: "debtc@finansheet.local", password: "secret123")
    @card = @user.cards.create!(name: "Nubank", mode: :credit)
    @auth = { "Authorization" => "Bearer #{AuthToken.encode(user_id: @user.id)}" }
    form = CardPurchaseForm.new(user: @user, card: @card, description: "Fogão", total_amount: 97.66,
                                installments_count: 1, third_party_name: "Mãe")
    form.save || raise(form.errors.full_messages.inspect)
    @installment = form.card_purchase.installments.first
  end

  test "GET lists people and known names" do
    get "/api/debts", headers: @auth, as: :json

    assert_response :ok
    body = JSON.parse(response.body)
    assert_equal ["Mãe"], body["known_names"]
    assert_equal 97.66, body["debts"].first["total"]
    assert_equal "Fogão", body["debts"].first["items"].first["description"]
  end

  test "GET with a future cycle includes what falls until then, and a past cycle shows today" do
    form = CardPurchaseForm.new(user: @user, card: @card, description: "TV", total_amount: 200,
                                installments_count: 2, third_party_name: "Mãe")
    form.save || raise(form.errors.full_messages.inspect)
    open = @user.open_cycle.number

    get "/api/debts?cycle=#{open + 1}", headers: @auth, as: :json
    body = JSON.parse(response.body)
    assert_equal open + 1, body["until_cycle"]
    assert_equal 297.66, body["debts"].first["total"]

    get "/api/debts?cycle=1", headers: @auth, as: :json
    assert_equal 197.66, JSON.parse(response.body)["debts"].first["total"]
  end

  test "POST reimburse marks the installments" do
    post "/api/debts/reimburse", params: { installment_ids: [@installment.id] }, headers: @auth, as: :json

    assert_response :ok
    assert_equal 1, JSON.parse(response.body)["reimbursed"]
    assert @installment.reload.reimbursed_at.present?
  end
end
