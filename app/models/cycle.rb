class Cycle < ApplicationRecord
  include Closable

  belongs_to :user

  has_many :installments,           dependent: :restrict_with_exception
  has_many :fixed_expense_payments, dependent: :restrict_with_exception
  has_many :card_checks, class_name: "CycleCardCheck", dependent: :delete_all

  # Período entre duas viradas. Aberto = closed_at nulo; sempre existe um
  # por usuário (User#open_cycle).
  scope :open,   -> { where(closed_at: nil) }
  scope :closed, -> { where.not(closed_at: nil) }

  validates :number,          numericality: { greater_than: 0, only_integer: true },
                              uniqueness: { scope: :user_id }
  validates :started_at,      presence: true
  validates :expected_income, numericality: { greater_than_or_equal_to: 0 }

  def closed?
    closed_at.present?
  end

  def was_closed?
    closed_at_was.present?
  end
end
