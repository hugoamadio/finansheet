module Debts
  # Marca parcelas de terceiros como devolvidas. Vale também para parcelas
  # de ciclo fechado: é só um registro, não muda o retrato do ciclo.
  class ReimburseService
    def initialize(user:, installment_ids:)
      @user = user
      @installment_ids = Array(installment_ids)
    end

    def call
      Installment.joins(:card_purchase)
                 .where(card_purchases: { user_id: @user.id })
                 .where.not(card_purchases: { third_party_name: nil })
                 .where(id: @installment_ids, reimbursed_at: nil)
                 .update_all(reimbursed_at: Time.current)
    end
  end
end
