module Purchases
  # Cria as parcelas em aberto de uma compra (installments_paid+1 até o
  # total), uma por ciclo a partir de first_cycle_number. A sobra de
  # centavos da divisão vai na última parcela.
  class InstallmentBuilder
    def initialize(card_purchase:, first_cycle_number:)
      @card_purchase      = card_purchase
      @first_cycle_number = first_cycle_number
    end

    def build!
      total = @card_purchase.total_amount.to_d
      count = @card_purchase.installments_count.to_i
      paid  = @card_purchase.installments_paid.to_i
      base  = (total / count).floor(2)
      last  = total - base * (count - 1)

      (count - paid).times do |i|
        number = paid + i + 1
        @card_purchase.installments.create!(
          number:       number,
          amount:       (number == count ? last : base),
          cycle_number: @first_cycle_number + i,
        )
      end
    end
  end
end
