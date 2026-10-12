require "test_helper"

module Debts
  class QueryTest < ActiveSupport::TestCase
    setup do
      @user = User.create!(email: "debts@finansheet.local", password: "secret123")
      @card = @user.cards.create!(name: "Nubank", mode: :credit)
      @open = @user.open_cycle
    end

    test "groups by person ignoring case and accents, only up to the open cycle" do
      buy("Mãe", 300, count: 3) # 100 no ciclo aberto, 200 nos próximos
      buy("mae", 50)
      buy("Pedro", 20)

      debts = Debts::Query.new(user: @user).call

      assert_equal ["Mãe", "Pedro"], debts.map(&:name)
      assert_equal 150.to_d, debts.first.total
      assert_equal 2, debts.first.items.size
    end

    test "ignores own purchases and reimbursed installments" do
      CardPurchaseForm.new(user: @user, card: @card, description: "Minha", total_amount: 10, installments_count: 1).save
      buy("Mãe", 40).installments.update_all(reimbursed_at: Time.current)

      assert_empty Debts::Query.new(user: @user).call
    end

    test "known_names keeps the first spelling of each person" do
      buy("Mãe", 10)
      buy("mae", 10)
      buy("Pedro", 10)

      assert_equal ["Mãe", "Pedro"], Debts::Query.new(user: @user).known_names
    end

    test "reimburse marks only this user's third party installments" do
      mine = buy("Mãe", 40)
      other = User.create!(email: "other-debt@finansheet.local", password: "secret123")
      other_form = CardPurchaseForm.new(user: other, card: other.cards.create!(name: "Itaú", mode: :credit),
                                        description: "Y", total_amount: 10, installments_count: 1, third_party_name: "Ana")
      other_form.save || raise(other_form.errors.full_messages.inspect)
      ids = mine.installments.pluck(:id) + other_form.card_purchase.installments.pluck(:id)

      assert_equal 1, Debts::ReimburseService.new(user: @user, installment_ids: ids).call
      assert_nil other_form.card_purchase.installments.first.reimbursed_at
    end

    private

    def buy(name, total, count: 1)
      form = CardPurchaseForm.new(user: @user, card: @card, description: "Compra #{name}", total_amount: total,
                                  installments_count: count, third_party_name: name)
      form.save || raise(form.errors.full_messages.inspect)
      form.card_purchase
    end
  end
end
