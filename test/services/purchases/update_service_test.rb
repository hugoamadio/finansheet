require "test_helper"

module Purchases
  class UpdateServiceTest < ActiveSupport::TestCase
    setup do
      @user     = User.create!(email: "upd@finansheet.local", password: "secret123")
      @card     = @user.cards.create!(name: "Nubank", mode: :credit)
      @open     = @user.open_cycle
      @purchase = create_purchase(total: 1200, count: 4)
    end

    test "rebuilds installments when total changes" do
      update!(total: 800, count: 4)

      @purchase.reload
      assert_equal 800.to_d, @purchase.total_amount
      assert_equal [200.to_d] * 4, @purchase.installments.order(:number).pluck(:amount)
    end

    test "rebuilds installments when count changes" do
      update!(total: 1200, count: 8)

      @purchase.reload
      assert_equal 8, @purchase.installments.count
      assert_equal [150.to_d] * 8, @purchase.installments.order(:number).pluck(:amount)
    end

    test "keeps the first installment in its cycle" do
      @purchase.installments.update_all("cycle_number = cycle_number + 2")
      first = @purchase.installments.minimum(:cycle_number)

      update!(total: 600, count: 6)

      assert_equal (first..first + 5).to_a, @purchase.reload.installments.order(:number).pluck(:cycle_number)
    end

    test "never places installments before the open cycle" do
      @purchase.installments.update_all(cycle_number: @open.number - 1)

      update!(total: 100, count: 1)

      assert_equal [@open.number], @purchase.reload.installments.pluck(:cycle_number)
    end

    test "raises EditingClosedPurchase when any installment has a cycle" do
      cycle = @user.cycles.create!(number: 99, started_at: 1.month.ago, closed_at: Time.current)
      @purchase.installments.first.update_columns(cycle_id: cycle.id)

      assert_raises(Purchases::UpdateService::EditingClosedPurchase) { update!(total: 100, count: 1) }
      assert_equal 4, @purchase.reload.installments_count
    end

    private

    def update!(total:, count:)
      Purchases::UpdateService.new(card_purchase: @purchase, total_amount: total, installments_count: count).call
    end

    def create_purchase(total:, count:)
      form = CardPurchaseForm.new(user: @user, card: @card, description: "Compra base",
                                  total_amount: total, installments_count: count)
      form.save || raise(form.errors.full_messages.inspect)
      form.card_purchase
    end
  end
end
