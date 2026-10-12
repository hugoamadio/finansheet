require "test_helper"

module Purchases
  class CancelRemainingServiceTest < ActiveSupport::TestCase
    setup do
      @user   = User.create!(email: "cancel@finansheet.local", password: "secret123")
      @card   = @user.cards.create!(name: "Nubank PJ", mode: :credit)
      @open   = @user.open_cycle
      @closed = @user.cycles.create!(number: 99, started_at: 2.months.ago, closed_at: 1.month.ago)
      @purchase = buy("Academia", total: 1390, count: 10)
      @purchase.installments.where(number: [1, 2]).update_all(cycle_id: @closed.id)
    end

    test "cancels from the given installment and fixes the total" do
      cancel!(@purchase, 3)

      @purchase.reload
      assert_equal 2, @purchase.installments_count
      assert_equal 278.to_d, @purchase.total_amount
      assert_equal [1, 2], @purchase.installments.order(:number).pluck(:number)
      assert @purchase.cancelled_at.present?
    end

    test "refuses to cancel an installment of a closed cycle" do
      error = assert_raises(Purchases::CancelRemainingService::InvalidStart) { cancel!(@purchase, 2) }

      assert_match "ciclo já fechado", error.message
      assert_equal 10, @purchase.reload.installments.count
    end

    test "refuses to cancel the whole purchase" do
      @purchase.installments.update_all(cycle_id: nil)

      error = assert_raises(Purchases::CancelRemainingService::InvalidStart) { cancel!(@purchase, 1) }

      assert_match "apague a compra", error.message
    end

    test "refuses an installment that does not exist" do
      assert_raises(Purchases::CancelRemainingService::InvalidStart) { cancel!(@purchase, 11) }
      assert_raises(Purchases::CancelRemainingService::InvalidStart) { cancel!(@purchase, "abc") }
    end

    test "counts installments paid before registration in the new total" do
      tv = buy("TV", total: 700, count: 7, paid: 2) # parcelas 3..7 de 100
      tv.installments.where(number: 3).update_all(cycle_id: @closed.id)

      cancel!(tv, 4)

      tv.reload
      assert_equal 3, tv.installments_count
      assert_equal 300.to_d, tv.total_amount
    end

    private

    def buy(description, total:, count:, paid: 0)
      form = CardPurchaseForm.new(user: @user, card: @card, description:, total_amount: total,
                                  installments_count: count, installments_paid: paid)
      form.save || raise(form.errors.full_messages.inspect)
      form.card_purchase
    end

    def cancel!(purchase, from)
      Purchases::CancelRemainingService.new(card_purchase: purchase, from_number: from).call
    end
  end
end
