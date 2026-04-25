class CardPurchaseForm
  include ActiveModel::Model

  attr_accessor :user, :card, :description, :total_amount, :installments_count, :purchased_on
  attr_reader :card_purchase

  validates :user,         presence: true
  validates :card,         presence: true
  validates :description,  presence: true
  validates :purchased_on, presence: true
  validates :total_amount,       presence: true, numericality: { greater_than: 0, allow_nil: true }
  validates :installments_count, presence: true, numericality: { greater_than: 0, only_integer: true, allow_nil: true }
  validate :card_must_have_best_day

  def save
    return false unless valid?

    ActiveRecord::Base.transaction do
      @card_purchase = CardPurchase.create!(
        user:,
        card:,
        description:,
        total_amount:,
        installments_count:,
        purchased_on:,
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

  def build_installments!
    base_amount = (total_amount.to_d / installments_count).floor(2)
    last_amount = total_amount.to_d - base_amount * (installments_count - 1)
    first = first_due_month

    installments_count.times do |i|
      @card_purchase.installments.create!(
        number:    i + 1,
        amount:    (i == installments_count - 1 ? last_amount : base_amount),
        due_month: first >> i,
      )
    end
  end

  def first_due_month
    base = Date.new(purchased_on.year, purchased_on.month, 1)
    if purchased_on.day <= card.best_day
      base >> 1
    else
      base >> 2
    end
  end
end
