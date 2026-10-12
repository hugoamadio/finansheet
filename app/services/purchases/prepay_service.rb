module Purchases
  # Quitar o restante: as parcelas de ciclos futuros vêm para o ciclo aberto
  # e somam no que o usuário paga nesta virada. O ciclo de origem fica em
  # original_cycle_number para permitir desfazer.
  class PrepayService
    class NothingToPrepay < StandardError; end

    def initialize(card_purchase:)
      @card_purchase = card_purchase
    end

    def call
      open_number = @card_purchase.user.open_cycle.number
      future = @card_purchase.installments.where(cycle_id: nil).where("cycle_number > ?", open_number)
      raise NothingToPrepay if future.none?

      future.update_all(["original_cycle_number = cycle_number, cycle_number = ?", open_number])
      @card_purchase
    end
  end
end
