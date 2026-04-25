class User < ApplicationRecord
  has_secure_password

  normalizes :email, with: ->(email) { email.to_s.strip.downcase }

  validates :email,
            presence: true,
            uniqueness: true,
            format: { with: URI::MailTo::EMAIL_REGEXP }

  has_many :user_cards, dependent: :destroy
  has_many :cards, through: :user_cards
end
