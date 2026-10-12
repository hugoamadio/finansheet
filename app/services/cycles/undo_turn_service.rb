module Cycles
  # Desfaz a última virada enquanto o ciclo novo está intocado (virou por
  # engano ou cedo demais): apaga o ciclo novo e reabre o anterior.
  class UndoTurnService
    class NotAllowed < StandardError; end

    def initialize(user:)
      @user = user
    end

    # Motivo que impede desfazer, ou nil quando pode.
    def blocker
      open = @user.cycles.open.first
      last = @user.cycles.closed.order(number: :desc).first
      return "não há virada para desfazer" unless open && last && last.number == open.number - 1
      return "já tem compra lançada no ciclo novo" if @user.card_purchases.where("card_purchases.created_at > ?", open.started_at).exists?
      return "já tem conta fixa paga no ciclo novo" if payments_of(open).where.not(paid_at: nil).exists?
      return "já tem cartão conferido no ciclo novo" if open.card_checks.exists?
      return "já tem parcela antecipada para o ciclo novo" if installments_of(open).where.not(original_cycle_number: nil).exists?

      nil
    end

    def call
      ActiveRecord::Base.transaction do
        @user.lock!
        reason = blocker
        raise NotAllowed, reason if reason

        open = @user.cycles.open.first
        last = @user.cycles.closed.order(number: :desc).first

        payments_of(open).delete_all
        open.destroy!
        Installment.where(cycle_id: last.id).update_all(cycle_id: nil)
        FixedExpensePayment.where(cycle_id: last.id).update_all(cycle_id: nil)
        # update_columns: o Closable bloqueia update de ciclo fechado.
        last.update_columns(closed_at: nil, total_income: 0, total_own_cards: 0,
                            total_third_party: 0, total_fixed_expenses: 0)
        last
      end
    end

    private

    def payments_of(cycle)
      FixedExpensePayment.where(fixed_expense_id: @user.fixed_expenses.select(:id), cycle_number: cycle.number)
    end

    def installments_of(cycle)
      Installment.joins(:card_purchase).where(card_purchases: { user_id: @user.id }, cycle_number: cycle.number)
    end
  end
end
