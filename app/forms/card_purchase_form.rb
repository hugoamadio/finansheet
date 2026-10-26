class CardPurchaseForm
  include ActiveModel::Model

  attr_accessor :user, :card, :description, :total_amount, :installments_count, :installments_paid, :third_party_name,
                :third_party_percent
  attr_reader :purchased_on, :card_purchase

  def purchased_on=(value)
    @purchased_on = parse_date(value)
  end

  validates :user,         presence: true
  validates :card,         presence: true
  validates :description,  presence: true
  validates :total_amount,       presence: true, numericality: { other_than: 0, allow_nil: true }
  validates :installments_count, presence: true, numericality: { greater_than: 0, only_integer: true, allow_nil: true }
  validate :installments_paid_in_range
  validate :refund_in_one_installment

  # A próxima parcela em aberto (installments_paid + 1) cai sempre no ciclo
  # aberto, e as seguintes um ciclo depois da outra. purchased_on é só
  # histórico (default hoje).
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
        purchased_on:      purchased_on || Date.current,
        third_party_name:,
        third_party_percent: third_party_percent.presence || 100,
      )
      Purchases::InstallmentBuilder.new(card_purchase: @card_purchase,
                                        first_cycle_number: user.open_cycle.number).build!
    end

    true
  end

  private

  def installments_paid_in_range
    return if installments_count.blank?
    paid = paid_count
    return if paid >= 0 && paid < installments_count.to_i

    errors.add(:installments_paid, "deve ser entre 0 e #{installments_count.to_i - 1}")
  end

  # Estorno (valor negativo) é crédito que cai de uma vez no ciclo aberto.
  def refund_in_one_installment
    return unless total_amount.to_d.negative? && installments_count.to_i != 1

    errors.add(:total_amount, "de estorno deve ser à vista (1 parcela)")
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
