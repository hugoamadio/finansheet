class CardPurchase < ApplicationRecord
  belongs_to :user
  belongs_to :card
  has_many :installments, dependent: :restrict_with_exception

  validates :description,        presence: true
  validates :total_amount,       numericality: { other_than: 0 }
  validates :installments_count, numericality: { greater_than: 0, only_integer: true }
  validates :purchased_on,       presence: true
  validates :installments_paid,
            numericality: { greater_than_or_equal_to: 0, only_integer: true }
  validate  :installments_paid_must_be_less_than_count
  validate  :refund_must_be_one_installment

  normalizes :third_party_name, with: ->(name) { name.squish.presence }

  # Compra feita por outra pessoa no cartão do usuário: soma na fatura,
  # mas não no saldo dele.
  def third_party?
    third_party_name.present?
  end

  # Estorno do cartão: valor negativo, à vista. Abate da fatura do ciclo.
  def refund?
    total_amount.to_d.negative?
  end

  def editable?
    installments.where.not(cycle_id: nil).none?
  end

  private

  def installments_paid_must_be_less_than_count
    return if installments_count.blank? || installments_paid.blank?
    return if installments_paid < installments_count

    errors.add(:installments_paid, "deve ser menor que o total de parcelas")
  end

  def refund_must_be_one_installment
    return unless refund? && installments_count != 1

    errors.add(:total_amount, "de estorno deve ser à vista (1 parcela)")
  end
end
