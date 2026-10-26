class Installment < ApplicationRecord
  include Closable

  belongs_to :card_purchase
  belongs_to :cycle, optional: true

  has_one :card, through: :card_purchase

  # Parte da parcela que é de outra pessoa (0 em compra do usuário). Usar
  # com joins(:card_purchase). Compra dividida: arredonda a parte da pessoa.
  THIRD_PARTY_AMOUNT_SQL = Arel.sql(
    "CASE WHEN card_purchases.third_party_name IS NULL THEN 0 " \
    "ELSE ROUND(installments.amount * card_purchases.third_party_percent / 100.0, 2) END",
  )

  validates :number,    numericality: { greater_than: 0, only_integer: true },
                        uniqueness: { scope: :card_purchase_id }
  validates :amount,    numericality: { other_than: 0 }
  validates :cycle_number, numericality: { greater_than: 0, only_integer: true }

  def closed?
    cycle_id.present?
  end

  def was_closed?
    cycle_id_was.present?
  end
end
