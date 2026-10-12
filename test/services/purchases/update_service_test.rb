require "test_helper"

module Purchases
  class UpdateServiceTest < ActiveSupport::TestCase
    setup do
      @user     = User.create!(email: "upd@finansheet.local", password: "secret123")
      @card     = @user.cards.create!(name: "Nubank", mode: :credit, best_day: 29, pay_day: 7)
      @purchase = create_purchase(total: 1200, count: 4)
    end

    test "rebuilds installments when total changes" do
      Purchases::UpdateService.new(
        card_purchase: @purchase, total_amount: 800, installments_count: 4,
      ).call

      @purchase.reload
      assert_equal 800.to_d, @purchase.total_amount
      amounts = @purchase.installments.order(:number).pluck(:amount)
      assert_equal [200.to_d] * 4, amounts
    end

    test "rebuilds installments when count changes" do
      Purchases::UpdateService.new(
        card_purchase: @purchase, total_amount: 1200, installments_count: 8,
      ).call

      @purchase.reload
      assert_equal 8, @purchase.installments_count
      assert_equal 8, @purchase.installments.count
      assert_equal [150.to_d] * 8, @purchase.installments.order(:number).pluck(:amount)
    end

    test "due_months stay anchored on purchased_on month" do
      original_first = @purchase.installments.order(:number).first.due_month
      Purchases::UpdateService.new(
        card_purchase: @purchase, total_amount: 600, installments_count: 6,
      ).call
      assert_equal original_first, @purchase.reload.installments.order(:number).first.due_month
    end

    test "advances to next open cycle when original due_month is in a closed cycle (orphan)" do
      # Parcela órfã: due_month em mês com ciclo fechado, mas cycle_id=NULL
      # (compra criada/editada DEPOIS do close — bind_installments! não pegou).
      @user.cycles.create!(number: 99, started_at: 1.month.ago, closed_at: Time.current)
      @purchase.installments.where(number: 1).update_all(due_month: Date.new(2026, 4, 1))

      Purchases::UpdateService.new(
        card_purchase: @purchase, total_amount: 100, installments_count: 1,
      ).call

      # Não deve preservar abril (fechado) — pula pra maio (próximo aberto).
      assert_equal Date.new(2026, 5, 1), @purchase.reload.installments.first.due_month
    end

    test "preserves original first due_month even if it differs from purchased_on month" do
      # Simula compra antiga cujo due_month NÃO bate com purchased_on.month
      # (ex: criada antes do best_day rule mudar, ou pq abril fechou depois).
      @purchase.installments.order(:number).each_with_index do |inst, i|
        inst.update_columns(due_month: Date.new(2026, 5, 1) >> i)
      end

      Purchases::UpdateService.new(
        card_purchase: @purchase, total_amount: 800, installments_count: 4,
      ).call

      # Deve continuar começando em maio, não voltar pra abril (purchased_on.month).
      expected = (0..3).map { |i| Date.new(2026, 5, 1) >> i }
      assert_equal expected, @purchase.reload.installments.order(:number).pluck(:due_month)
    end

    test "raises EditingClosedPurchase when any installment has a cycle" do
      cycle = @user.cycles.create!(number: 99, started_at: 1.month.ago, closed_at: Time.current)
      @purchase.installments.first.update_columns(cycle_id: cycle.id)

      assert_raises Purchases::UpdateService::EditingClosedPurchase do
        Purchases::UpdateService.new(
          card_purchase: @purchase, total_amount: 100, installments_count: 1,
        ).call
      end

      # Não deve ter mexido em nada
      assert_equal 4, @purchase.reload.installments_count
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
