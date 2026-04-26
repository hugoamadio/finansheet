require "test_helper"

class AuthControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user  = User.create!(email: "auth@finansheet.local", password: "secret123")
    @token = AuthToken.encode(user_id: @user.id)
    @auth  = { "Authorization" => "Bearer #{@token}" }
  end

  test "GET /me includes salary fields" do
    get me_path, headers: @auth
    assert_response :ok

    body = JSON.parse(response.body)
    assert body["success"]
    assert_equal @user.email, body["user"]["email"]
    assert_nil   body["user"]["salary_day"]
    assert_equal false, body["user"]["salary_on_last_day"]
  end

  test "PATCH /me sets salary_day" do
    patch me_path, params: { user: { salary_day: 10, salary_on_last_day: false } }, headers: @auth, as: :json
    assert_response :ok

    body = JSON.parse(response.body)
    assert_equal 10, body["user"]["salary_day"]
    assert_equal false, body["user"]["salary_on_last_day"]
    assert_equal 10, @user.reload.salary_day
  end

  test "PATCH /me sets salary_on_last_day with empty day" do
    patch me_path, params: { user: { salary_day: "", salary_on_last_day: true } }, headers: @auth, as: :json
    assert_response :ok

    body = JSON.parse(response.body)
    assert_nil body["user"]["salary_day"]
    assert_equal true, body["user"]["salary_on_last_day"]
    @user.reload
    assert_nil @user.salary_day
    assert @user.salary_on_last_day?
  end

  test "PATCH /me rejects out-of-range salary_day" do
    patch me_path, params: { user: { salary_day: 99 } }, headers: @auth, as: :json
    assert_response :unprocessable_entity

    body = JSON.parse(response.body)
    refute body["success"]
    assert body["errors"].any?
  end

  test "PATCH /me requires auth" do
    patch me_path, params: { user: { salary_day: 5 } }, as: :json
    assert_response :unauthorized
  end
end
