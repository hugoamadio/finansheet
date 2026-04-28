class Income < ApplicationRecord
  belongs_to :user

  validates :reference_month, presence: true,
                              uniqueness: { scope: :user_id }
  validates :amount,          numericality: { greater_than_or_equal_to: 0 }
end
