class CardPurchaseForm
  include ActiveModel::Model

  attr_accessor :user, :card, :description, :total_amount, :installments_count, :installments_paid
  attr_reader :purchased_on, :next_due_month, :card_purchase

  def purchased_on=(value)
    @purchased_on = parse_date(value)
  end

  # Mês onde a próxima parcela em aberto deve cair. Quando informado, dispensa
  # `purchased_on` como referência de cálculo — o sistema põe a parcela
  # `installments_paid + 1` neste mês (passando ainda por next_open_cycle_month).
  def next_due_month=(value)
    parsed = parse_date(value)
    @next_due_month = parsed&.beginning_of_month
  end

  validates :user,         presence: true
  validates :card,         presence: true
  validates :description,  presence: true
  validates :total_amount,       presence: true, numericality: { greater_than: 0, allow_nil: true }
  validates :installments_count, presence: true, numericality: { greater_than: 0, only_integer: true, allow_nil: true }
  validate :card_must_have_best_day
  validate :installments_paid_in_range

  def save
    return false unless valid?

    ActiveRecord::Base.transaction do
      @card_purchase = CardPurchase.create!(
        user:,
        card:,
        description:,
        total_amount:,
        installments_count:,
        installments_paid: paid_count,
        # purchased_on vira histórico; quando o usuário só informou o mês da
        # próxima parcela, registramos hoje como referência (não influencia
        # o cálculo das parcelas, que parte de next_due_month).
        purchased_on: purchased_on || Date.current,
      )
      build_installments!
    end

    true
  end

  private

  def card_must_have_best_day
    return if card.blank?
    return if card.best_day.present?

    errors.add(:card, "deve ter best_day configurado")
  end

  def installments_paid_in_range
    return if installments_count.blank?
    paid = paid_count
    return if paid >= 0 && paid < installments_count.to_i

    errors.add(:installments_paid, "deve ser entre 0 e #{installments_count.to_i - 1}")
  end

  def build_installments!
    count = installments_count.to_i
    paid  = paid_count
    base_amount = (total_amount.to_d / count).floor(2)
    last_amount = total_amount.to_d - base_amount * (count - 1)
    first       = first_due_month

    (count - paid).times do |i|
      number = paid + i + 1
      @card_purchase.installments.create!(
        number:    number,
        amount:    (number == count ? last_amount : base_amount),
        due_month: first >> i,
      )
    end
  end

  def first_due_month
    # Quando o usuário informou o mês da próxima parcela em aberto (caminho
    # típico pra compra com parcelas já pagas), usamos esse mês direto — sem
    # deslocar por `installments_paid` (já implícito).
    base = if next_due_month
             next_due_month
           else
             reference = purchased_on || Date.current
             Date.new(reference.year, reference.month, 1) >> paid_count
           end
    user.next_open_cycle_month(base)
  end

  def paid_count
    installments_paid.to_i
  end

  def parse_date(value)
    case value
    when Date   then value
    when String then (Date.parse(value) rescue nil)
    end
  end
end
