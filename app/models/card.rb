class Card < ApplicationRecord
  enum :mode, { credit: "credit", debit: "debit" }

  has_many :user_cards, dependent: :destroy
  has_many :users, through: :user_cards

  validates :mode, presence: true
end
