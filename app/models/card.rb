class Card < ApplicationRecord
  enum :mode, { credit: "credit", debit: "debit" }, validate: true

  has_many :user_cards,     dependent: :destroy
  has_many :users,          through: :user_cards
  has_many :card_purchases, dependent: :restrict_with_exception

  validates :pay_day,  numericality: { in: 1..31, only_integer: true }, allow_nil: true
  validates :best_day, numericality: { in: 1..31, only_integer: true }, allow_nil: true
  validates :color, format: { with: /\A#\h{6}\z/ }, allow_nil: true
end
