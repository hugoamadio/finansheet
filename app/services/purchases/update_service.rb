module Purchases
  # Atualiza o total e a quantidade de parcelas de uma CardPurchase, recriando
  # todas as installments do zero. Recusa se qualquer parcela já estiver
  # vinculada a um cycle (Closable concern: histórico de fatura paga é imutável).
  class UpdateService
    class EditingClosedPurchase < StandardError; end

    def initialize(card_purchase:, total_amount:, installments_count:)
      @card_purchase      = card_purchase
      @total_amount       = total_amount
      @installments_count = installments_count
    end

    def call
      raise self.class::EditingClosedPurchase unless @card_purchase.editable?

      ActiveRecord::Base.transaction do
        # Preserva o due_month da 1ª parcela ANTES de mexer em qualquer coisa.
        # editable? garante que nenhuma parcela tem cycle_id, mas pode ter
        # parcela "órfã" (due_month em mês com ciclo fechado, mas cycle_id=NULL),
        # então passa por next_open_cycle_month pra normalizar.
        first_due_month = @card_purchase.installments.minimum(:due_month)
        first_due_month = @card_purchase.user.next_open_cycle_month(first_due_month)

        # installments_paid não é editável pelo service — preservamos o valor
        # original. A numeração das parcelas regeradas começa em paid+1.
        paid = @card_purchase.installments_paid.to_i

        @card_purchase.update!(
          total_amount:       @total_amount,
          installments_count: @installments_count,
        )
        @card_purchase.installments.destroy_all
        build_installments!(first_due_month: first_due_month, paid: paid)
      end

      @card_purchase
    end

    private

    def build_installments!(first_due_month:, paid:)
      total = @total_amount.to_d
      count = @installments_count.to_i
      base  = (total / count).floor(2)
      last  = total - base * (count - 1)

      (count - paid).times do |i|
        number = paid + i + 1
        @card_purchase.installments.create!(
          number:    number,
          amount:    (number == count ? last : base),
          due_month: first_due_month >> i,
        )
      end
    end
  end
end
