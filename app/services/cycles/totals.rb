module Cycles
  # Soma o que cai num número de ciclo: parcelas do usuário, parcelas de
  # terceiros e contas fixas. Base do retrato da virada e dos resumos.
  class Totals
    Result = Data.define(:own_cards, :third_party, :fixed_expenses)

    def initialize(user:, cycle_number:)
      @user = user
      @cycle_number = cycle_number
    end

    def call
      installments = Installment.joins(:card_purchase)
                                .where(card_purchases: { user_id: @user.id }, cycle_number: @cycle_number)

      third_party = installments.sum(Installment::THIRD_PARTY_AMOUNT_SQL)

      Result.new(
        own_cards:      installments.sum(:amount) - third_party,
        third_party:,
        fixed_expenses: FixedExpensePayment.joins(:fixed_expense)
                                           .where(fixed_expenses: { user_id: @user.id }, cycle_number: @cycle_number)
                                           .sum(:amount),
      )
    end
  end
end
