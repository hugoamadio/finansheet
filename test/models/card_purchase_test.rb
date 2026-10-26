require "test_helper"

class CardPurchaseTest < ActiveSupport::TestCase
  test "third_party_name is squished and blank becomes nil" do
    assert_equal "Mãe da Silva", CardPurchase.new(third_party_name: "  Mãe  da  Silva ").third_party_name
    assert_nil CardPurchase.new(third_party_name: "   ").third_party_name
  end

  test "third_party_percent must be between 1 and 100" do
    purchase = CardPurchase.new(third_party_name: "Beatriz", third_party_percent: 0)
    purchase.validate
    assert purchase.errors.of_kind?(:third_party_percent, :greater_than_or_equal_to)
    assert_equal 100, CardPurchase.new.third_party_percent
  end

  test "third_party? reflects the name" do
    assert CardPurchase.new(third_party_name: "Mãe").third_party?
    assert_not CardPurchase.new.third_party?
  end
end
