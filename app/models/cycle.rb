class Cycle < ApplicationRecord
  include Closable

  belongs_to :user

  has_many :installments,           dependent: :restrict_with_exception
  has_many :fixed_expense_payments, dependent: :restrict_with_exception

  validates :reference_month, presence: true,
                              uniqueness: { scope: :user_id }
  validates :closed_at,       presence: true

  validates :total_income,   numericality: { greater_than_or_equal_to: 0 }
  validates :total_expenses, numericality: { greater_than_or_equal_to: 0 }

  def closed?
    closed_at.present?
  end

  def was_closed?
    closed_at_was.present?
  end
end
