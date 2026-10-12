require "test_helper"

module Purchases
  class PrepayServicesTest < ActiveSupport::TestCase
    setup do
      @user = User.create!(email: "pre@finansheet.local", password: "secret123")
      @card = @user.cards.create!(name: "Nubank", mode: :credit)
      @open = @user.open_cycle
      form = CardPurchaseForm.new(user: @user, card: @card, description: "Celular", total_amount: 300, installments_count: 3)
      form.save || raise(form.errors.full_messages.inspect)
      @purchase = form.card_purchase
    end

    test "prepay brings future installments to the open cycle and remembers where they were" do
      Purchases::PrepayService.new(card_purchase: @purchase).call

      rows = @purchase.installments.order(:number).pluck(:cycle_number, :original_cycle_number)
      assert_equal [[@open.number, nil], [@open.number, @open.number + 1], [@open.number, @open.number + 2]], rows
    end

    test "prepay without future installments raises" do
      Purchases::PrepayService.new(card_purchase: @purchase).call

      assert_raises(Purchases::PrepayService::NothingToPrepay) do
        Purchases::PrepayService.new(card_purchase: @purchase).call
      end
    end

    test "undo puts installments back" do
      Purchases::PrepayService.new(card_purchase: @purchase).call
      Purchases::UndoPrepayService.new(card_purchase: @purchase).call

      rows = @purchase.installments.order(:number).pluck(:cycle_number, :original_cycle_number)
      assert_equal [[@open.number, nil], [@open.number + 1, nil], [@open.number + 2, nil]], rows
    end

    test "undo is not possible after the cycle turned" do
      Purchases::PrepayService.new(card_purchase: @purchase).call
      Cycles::TurnService.new(user: @user, cycle_id: @open.id).call

      assert_raises(Purchases::UndoPrepayService::NothingToUndo) do
        Purchases::UndoPrepayService.new(card_purchase: @purchase.reload).call
      end
    end
  end
end
