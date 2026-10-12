module Purchases
  # Atualiza o total e a quantidade de parcelas de uma CardPurchase, recriando
  # as parcelas em aberto (installments_paid é preservado). Recusa se qualquer
  # parcela já estiver num ciclo fechado.
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
        # editable? garante que nada está em ciclo fechado. A 1ª parcela em
        # aberto continua no ciclo onde estava, mas nunca antes do aberto.
        open_number  = @card_purchase.user.open_cycle.number
        first_number = [@card_purchase.installments.minimum(:cycle_number), open_number].compact.max

        @card_purchase.update!(
          total_amount:       @total_amount,
          installments_count: @installments_count,
        )
        @card_purchase.installments.destroy_all
        InstallmentBuilder.new(card_purchase: @card_purchase, first_cycle_number: first_number).build!
      end

      @card_purchase
    end
  end
end
