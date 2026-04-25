class FixedExpensePayment < ApplicationRecord
  include Closable

  belongs_to :fixed_expense
  belongs_to :cycle, optional: true

  validates :amount,          numericality: { greater_than: 0 }
  validates :reference_month, presence: true,
                              uniqueness: { scope: :fixed_expense_id }

  def closed?
    cycle_id.present?
  end

  def was_closed?
    cycle_id_was.present?
  end
end
