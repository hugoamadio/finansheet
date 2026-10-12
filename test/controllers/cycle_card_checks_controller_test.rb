require "test_helper"

class CycleCardChecksControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = User.create!(email: "check@finansheet.local", password: "secret123")
    @card = @user.cards.create!(name: "Nubank", mode: :credit)
    @auth = { "Authorization" => "Bearer #{AuthToken.encode(user_id: @user.id)}" }
  end

  test "PUT marks the card as checked in the open cycle and is idempotent" do
    2.times do
      put "/api/cycles/current/cards/#{@card.id}/check", headers: @auth, as: :json
      assert_response :ok
    end

    assert_equal 1, @user.open_cycle.card_checks.where(card: @card).count
  end

  test "DELETE unchecks" do
    @user.open_cycle.card_checks.create!(card: @card, checked_at: Time.current)

    delete "/api/cycles/current/cards/#{@card.id}/check", headers: @auth, as: :json

    assert_response :ok
    assert_equal 0, CycleCardCheck.count
  end

  test "another user's card is not found" do
    other_card = User.create!(email: "x@finansheet.local", password: "secret123").cards.create!(name: "Itaú", mode: :credit)

    put "/api/cycles/current/cards/#{other_card.id}/check", headers: @auth, as: :json

    assert_response :not_found
  end
end
