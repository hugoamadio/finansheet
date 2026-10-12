require "test_helper"

module Purchases
  class DestroyServiceTest < ActiveSupport::TestCase
    setup do
      @user     = User.create!(email: "del@finansheet.local", password: "secret123")
      @card     = @user.cards.create!(name: "Nubank", mode: :credit, best_day: 29, pay_day: 7)
      @purchase = create_purchase(total: 1200, count: 4)
    end

    test "removes purchase and its installments" do
      Purchases::DestroyService.new(card_purchase: @purchase).call

      refute CardPurchase.exists?(@purchase.id)
      assert_equal 0, Installment.where(card_purchase_id: @purchase.id).count
    end

    test "raises DestroyingClosedPurchase when an installment is closed" do
      cycle = @user.cycles.create!(number: 99, started_at: 1.month.ago, closed_at: Time.current)
      @purchase.installments.first.update_columns(cycle_id: cycle.id)

      assert_raises Purchases::DestroyService::DestroyingClosedPurchase do
        Purchases::DestroyService.new(card_purchase: @purchase).call
      end

      assert CardPurchase.exists?(@purchase.id)
      assert_equal 4, @purchase.installments.count
    end

    private

    def create_purchase(total:, count:)
      form = CardPurchaseForm.new(
        user: @user, card: @card, description: "Compra base",
        total_amount: total, installments_count: count,
        purchased_on: Date.new(2026, 4, 24),
      )
      form.save || raise(form.errors.full_messages.inspect)
      form.card_purchase
    end
  end
end
