module Cycles
  class CloseService
    def initialize(user:, reference_month: Date.current.beginning_of_month)
      @user = user
      @reference_month = reference_month
    end

    def call
      ActiveRecord::Base.transaction do
        cycle = Cycle.create!(
          user:            @user,
          reference_month: @reference_month,
          closed_at:       Time.current,
        )

        bind_installments!(cycle)
        bind_fixed_expense_payments!(cycle)
        update_totals!(cycle)

        cycle
      end
    end

    private

    def bind_installments!(cycle)
      Installment
        .joins(:card_purchase)
        .where(card_purchases: { user_id: @user.id })
        .where(cycle_id: nil)
        .where("installments.due_month <= ?", @reference_month)
        .update_all(cycle_id: cycle.id)
    end

    def bind_fixed_expense_payments!(cycle)
      FixedExpensePayment
        .joins(:fixed_expense)
        .where(fixed_expenses: { user_id: @user.id })
        .where(cycle_id: nil, reference_month: @reference_month)
        .update_all(cycle_id: cycle.id)
    end

    def update_totals!(cycle)
      total_expenses = cycle.installments.sum(:amount) + cycle.fixed_expense_payments.sum(:amount)
      cycle.update_columns(total_expenses: total_expenses)
    end
  end
end
