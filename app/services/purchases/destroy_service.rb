module Purchases
  # Remove uma CardPurchase e todas as suas installments numa transaction.
  # Recusa se qualquer parcela já estiver vinculada a um cycle (Closable).
  class DestroyService
    class DestroyingClosedPurchase < StandardError; end

    def initialize(card_purchase:)
      @card_purchase = card_purchase
    end

    def call
      raise self.class::DestroyingClosedPurchase unless @card_purchase.editable?

      ActiveRecord::Base.transaction do
        @card_purchase.installments.destroy_all
        @card_purchase.destroy!
      end
    end
  end
end
