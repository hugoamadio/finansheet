require "test_helper"

module Purchases
  class ActionsTest < ActiveSupport::TestCase
    setup do
      @user = User.create!(email: "act@finansheet.local", password: "secret123")
      @card = @user.cards.create!(name: "Nubank", mode: :credit)
      @open = @user.open_cycle
    end

    test "new purchase with future installments is editable and can be prepaid" do
      flags = flags_for(buy(count: 3))

      assert flags.editable
      assert flags.can_prepay
      assert_not flags.can_undo_prepay
      assert_nil flags.cancel_from
    end

    test "single installment purchase cannot be prepaid" do
      assert_not flags_for(buy(count: 1)).can_prepay
    end

    test "purchase with a closed installment suggests cancelling from the first open one" do
      purchase = buy(count: 10)
      closed = @user.cycles.create!(number: 99, started_at: 1.month.ago, closed_at: Time.current)
      purchase.installments.where(number: [1, 2]).update_all(cycle_id: closed.id)

      flags = flags_for(purchase)

      assert_not flags.editable
      assert_equal 3, flags.cancel_from
    end

    test "prepaid installments in the open cycle can be undone" do
      purchase = buy(count: 3)
      purchase.installments.where(number: [2, 3])
              .update_all(["original_cycle_number = cycle_number, cycle_number = ?", @open.number])

      flags = flags_for(purchase)

      assert flags.can_undo_prepay
      assert_not flags.can_prepay
    end

    private

    def buy(count:)
      form = CardPurchaseForm.new(user: @user, card: @card, description: "X",
                                  total_amount: 100 * count, installments_count: count)
      form.save || raise(form.errors.full_messages.inspect)
      form.card_purchase
    end

    def flags_for(purchase)
      Purchases::Actions.for([purchase], open_number: @open.number).fetch(purchase.id)
    end
  end
end
