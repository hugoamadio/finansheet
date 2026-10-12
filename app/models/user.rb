class User < ApplicationRecord
  # `validations: false` desliga a validação automática de presença/length de
  # password. Isso é necessário porque users criados via Google OAuth não têm
  # senha (campo `password_digest` fica nil). A presença/length passa a ser
  # validada por nós abaixo, condicionalmente.
  has_secure_password validations: false

  normalizes :email, with: ->(email) { email.to_s.strip.downcase }

  validates :email,
            presence: true,
            uniqueness: true,
            format: { with: URI::MailTo::EMAIL_REGEXP }

  # Senha tem mínimo de 8 caracteres SEMPRE que vier preenchida (signup
  # tradicional ou troca de senha futura). E é obrigatória na criação só
  # quando o user não tem provider OAuth (signup tradicional).
  validates :password, length: { minimum: 8 }, if: -> { password.present? }
  validates :password, presence: true, on: :create, unless: -> { provider.present? }

  validates :salary_day,
            numericality: { in: 1..31, only_integer: true },
            allow_nil: true
  validate  :salary_day_xor_last_day

  has_many :user_cards,     dependent: :destroy
  has_many :cards,          through: :user_cards
  has_many :cycles,         dependent: :restrict_with_exception
  has_many :fixed_expenses, dependent: :destroy
  has_many :card_purchases, dependent: :restrict_with_exception
  has_many :incomes,        dependent: :destroy

  # Resolve um User a partir do hash que o OmniAuth devolve no callback do
  # provider (ex: Google). Estratégia em 3 tentativas, em ordem:
  #   1. Match por (provider, uid) — login subsequente do mesmo Google.
  #   2. Match por email — usuário já tem conta com email/senha; LINKA o
  #      provider/uid no User existente (UX: clicar "Entrar com Google" com
  #      um email já cadastrado leva pra mesma conta).
  #   3. Cria um User novo com email + provider + uid (sem senha — permitido
  #      pelo `has_secure_password validations: false`).
  def self.from_omniauth(auth)
    user = find_by(provider: auth.provider, uid: auth.uid)
    return user if user

    email = auth.info&.email.to_s.strip.downcase
    return nil if email.blank?

    if (existing = find_by(email: email))
      existing.update!(provider: auth.provider, uid: auth.uid)
      return existing
    end

    create!(email: email, provider: auth.provider, uid: auth.uid)
  end

  def salary_configured?
    salary_day.present? || salary_on_last_day?
  end

  # Ciclo aberto do usuário. Conta nova (sem ciclo) ganha o ciclo seguinte
  # ao último número usado — o 1 na primeira vez.
  def open_cycle
    cycles.open.first || cycles.create!(number: (cycles.maximum(:number) || 0) + 1, started_at: Time.current)
  rescue ActiveRecord::RecordNotUnique
    cycles.open.first!
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
