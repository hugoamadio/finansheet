module Purchases
  # O que cada compra aceita agora (editar, quitar, desfazer quitação,
  # cancelar o restante), para várias compras com uma query só — a tela
  # lista várias de uma vez.
  class Actions
    Flags = Data.define(:editable, :can_prepay, :can_undo_prepay, :cancel_from)

    # Posições das colunas lidas de cada parcela (ver pluck abaixo).
    NUMBER       = 1
    CYCLE_NUMBER = 2
    CYCLE_ID     = 3
    ORIGINAL     = 4

    def self.for(purchases, open_number:)
      rows = Installment.where(card_purchase_id: purchases.map(&:id))
                        .pluck(:card_purchase_id, :number, :cycle_number, :cycle_id, :original_cycle_number)
                        .group_by(&:first)

      purchases.to_h do |purchase|
        installments = rows.fetch(purchase.id, [])
        open_rows    = installments.reject { |row| row[CYCLE_ID] }
        any_closed   = open_rows.size < installments.size

        [purchase.id, Flags.new(
          editable:        !any_closed,
          can_prepay:      open_rows.any? { |row| row[CYCLE_NUMBER] > open_number },
          can_undo_prepay: open_rows.any? { |row| row[CYCLE_NUMBER] == open_number && row[ORIGINAL] },
          cancel_from:     any_closed ? cancel_from(purchase, open_rows) : nil,
        )]
      end
    end

    # Cancelar o restante só aparece com parcela já fechada (sem isso dá pra
    # editar ou apagar). Sugere a 1ª parcela em aberto, nunca a 1ª da compra
    # (isso seria apagar tudo).
    def self.cancel_from(purchase, open_rows)
      first_open = open_rows.map { |row| row[NUMBER] }.min
      return nil unless first_open

      from = [first_open, purchase.installments_paid + 2].max
      from <= purchase.installments_count ? from : nil
    end
    private_class_method :cancel_from
  end
end
