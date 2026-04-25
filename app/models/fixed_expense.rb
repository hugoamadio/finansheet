class FixedExpense < ApplicationRecord
  belongs_to :user
  has_many :payments, class_name: "FixedExpensePayment", dependent: :restrict_with_exception

  validates :name,   presence: true
  validates :amount, numericality: { greater_than: 0 }
  validates :due_day, numericality: { in: 1..31, only_integer: true }, allow_nil: true

  scope :active, -> { where(active: true) }
end
