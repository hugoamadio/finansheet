class CardPurchase < ApplicationRecord
  belongs_to :user
  belongs_to :card
  has_many :installments, dependent: :restrict_with_exception

  validates :description,        presence: true
  validates :total_amount,       numericality: { greater_than: 0 }
  validates :installments_count, numericality: { greater_than: 0, only_integer: true }
  validates :purchased_on,       presence: true
end
