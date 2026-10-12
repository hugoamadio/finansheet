class FixedExpense < ApplicationRecord
  belongs_to :user
  has_many :payments, class_name: "FixedExpensePayment", dependent: :restrict_with_exception

  validates :name,   presence: true
  validates :amount, numericality: { greater_than: 0 }
  validates :due_day, numericality: { in: 1..31, only_integer: true }, allow_nil: true

  validate :installments_consistency

  scope :active, -> { where(active: true) }

  # Parcelada = tem fim definido (ex: sofá em 10×). Recorrente = installments_count nil.
  def parceled?
    installments_count.present?
  end

  private

  # Espelha a check constraint do banco com mensagens amigáveis.
  def installments_consistency
    if installments_count.blank? && start_cycle_number.blank?
      errors.add(:installments_paid, "deve ser 0 em conta recorrente") if installments_paid.to_i.positive?
      return
    end

    if installments_count.blank? || start_cycle_number.blank?
      errors.add(:base, "informe total de parcelas e ciclo da próxima parcela, ou deixe ambos vazios")
      return
    end

    unless installments_count.to_i.positive?
      errors.add(:installments_count, "deve ser maior que zero")
    end

    paid = installments_paid.to_i
    if paid < 0 || paid >= installments_count.to_i
      errors.add(:installments_paid, "deve estar entre 0 e #{installments_count.to_i - 1}")
    end
  end
end
