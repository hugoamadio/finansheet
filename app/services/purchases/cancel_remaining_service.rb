module Purchases
  # Cancela as parcelas a partir de from_number (ex.: assinatura cancelada no
  # meio). A compra passa a ter só as parcelas anteriores e o total é
  # corrigido para o que de fato foi pago.
  class CancelRemainingService
    class InvalidStart < StandardError; end

    def initialize(card_purchase:, from_number:)
      @card_purchase = card_purchase
      @from_number   = Integer(from_number.to_s, exception: false)
    end

    def call
      validate!

      ActiveRecord::Base.transaction do
        kept_total = kept_amount
        cancelled.delete_all
        @card_purchase.update!(installments_count: @from_number - 1, total_amount: kept_total,
                               cancelled_at: Time.current)
      end

      @card_purchase
    end

    private

    def validate!
      raise InvalidStart, "parcela inválida" if @from_number.nil? || cancelled.none?
      raise InvalidStart, "não dá para cancelar parcela de ciclo já fechado" if cancelled.where.not(cycle_id: nil).exists?
      return if @from_number > @card_purchase.installments_paid + 1

      raise InvalidStart, "para cancelar a compra inteira, apague a compra"
    end

    def cancelled
      @card_purchase.installments.where("number >= ?", @from_number)
    end

    # Parcelas pagas antes do cadastro (installments_paid) não viram linha;
    # valem o mesmo valor-base da divisão.
    def kept_amount
      base = (@card_purchase.total_amount / @card_purchase.installments_count).floor(2)
      base * @card_purchase.installments_paid + @card_purchase.installments.where("number < ?", @from_number).sum(:amount)
    end
  end
end
