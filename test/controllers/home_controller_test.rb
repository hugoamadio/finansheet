require "test_helper"

# As páginas são cascas: os dados chegam por fetch na API (com token).
class HomeControllerTest < ActionDispatch::IntegrationTest
  test "turn page renders" do
    get "/dashboard/virada"

    assert_response :ok
    assert_includes response.body, 'data-controller="turn"'
  end

  test "cycles page renders" do
    get "/ciclos"

    assert_response :ok
    assert_includes response.body, 'data-controller="cycles-page"'
  end
end
