class Installment < ApplicationRecord
  include Closable

  belongs_to :card_purchase
  belongs_to :cycle, optional: true

  has_one :card, through: :card_purchase

  validates :number,    numericality: { greater_than: 0, only_integer: true },
                        uniqueness: { scope: :card_purchase_id }
  validates :amount,    numericality: { greater_than: 0 }
  validates :cycle_number, numericality: { greater_than: 0, only_integer: true }

  def closed?
    cycle_id.present?
  end

  def was_closed?
    cycle_id_was.present?
  end
end
