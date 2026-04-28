class User < ApplicationRecord
  has_secure_password

  normalizes :email, with: ->(email) { email.to_s.strip.downcase }

  validates :email,
            presence: true,
            uniqueness: true,
            format: { with: URI::MailTo::EMAIL_REGEXP }

  validates :salary_day,
            numericality: { in: 1..31, only_integer: true },
            allow_nil: true
  validate  :salary_day_xor_last_day

  has_many :user_cards,     dependent: :destroy
  has_many :cards,          through: :user_cards
  has_many :cycles,         dependent: :restrict_with_exception
  has_many :fixed_expenses, dependent: :destroy
  has_many :card_purchases, dependent: :restrict_with_exception

  def salary_configured?
    salary_day.present? || salary_on_last_day?
  end

  # Primeiro mês com ciclo ainda aberto a partir de `from` (default: mês corrente).
  # Usado pra: ciclo ativo no boot da home, due_month de novas compras, e
  # rebuild de installments em edições — todos compartilham a regra "pula
  # ciclos já fechados".
  def next_open_cycle_month(from = Date.current.beginning_of_month)
    candidate = from
    candidate = candidate >> 1 while cycles.exists?(reference_month: candidate)
    candidate
  end

  # Devolve a data efetiva do salário num mês — clampando dias inexistentes
  # (ex: dia 31 em fevereiro vira o último dia do mês). Quando o usuário
  # marcou salary_on_last_day, sempre devolve o último dia do mês.
  def salary_date_for(year:, month:)
    return nil unless salary_configured?

    last = Date.new(year, month, -1)
    return last if salary_on_last_day?

    Date.new(year, month, [salary_day, last.day].min)
  end

  private

  def salary_day_xor_last_day
    return unless salary_day.present? && salary_on_last_day?

    errors.add(:base, "use dia fixo OU último dia do mês, não ambos")
  end
end
