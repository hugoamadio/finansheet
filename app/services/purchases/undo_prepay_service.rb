module Purchases
  # Desfaz a quitação enquanto o ciclo aberto não virou: as parcelas
  # antecipadas voltam para os ciclos de origem.
  class UndoPrepayService
    class NothingToUndo < StandardError; end

    def initialize(card_purchase:)
      @card_purchase = card_purchase
    end

    def call
      open_number = @card_purchase.user.open_cycle.number
      prepaid = @card_purchase.installments
                              .where(cycle_id: nil, cycle_number: open_number)
                              .where.not(original_cycle_number: nil)
      raise NothingToUndo if prepaid.none?

      # No Postgres o SET usa os valores antigos da linha: cycle_number recebe
      # o original antes de ele virar NULL.
      prepaid.update_all("cycle_number = original_cycle_number, original_cycle_number = NULL")
      @card_purchase
    end
  end
end
