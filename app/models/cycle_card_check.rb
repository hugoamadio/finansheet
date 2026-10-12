# "Conferido ✓" de um cartão num ciclo: o usuário bateu o total do app com
# o app do banco.
class CycleCardCheck < ApplicationRecord
  belongs_to :cycle
  belongs_to :card

  validates :checked_at, presence: true
  validates :card_id,    uniqueness: { scope: :cycle_id }
end
