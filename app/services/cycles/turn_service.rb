module Cycles
  # Vira o ciclo: fecha o aberto gravando o retrato (renda, cartões,
  # terceiros, contas fixas), amarra parcelas e contas a ele e abre o
  # próximo com a mesma renda prevista. Recebe o id do ciclo que a tela
  # mostrava, então clique duplo / duas abas não viram dois ciclos.
  class TurnService
    class AlreadyTurned < StandardError; end

    def initialize(user:, cycle_id:)
      @user = user
      @cycle_id = cycle_id
    end

    def call
      ActiveRecord::Base.transaction do
        @user.lock!
        cycle = @user.cycles.open.find_by(id: @cycle_id)
        raise AlreadyTurned unless cycle

        # Conta fixa que o usuário nunca listou neste ciclo ainda não tem
        # pagamento; sem isso ficaria fora do retrato.
        FixedExpenses::EnsurePaymentsForCycle.new(user: @user, cycle_number: cycle.number).call
        close!(cycle)

        next_cycle = @user.cycles.create!(number: cycle.number + 1, started_at: cycle.closed_at,
                                          expected_income: cycle.expected_income)
        FixedExpenses::EnsurePaymentsForCycle.new(user: @user, cycle_number: next_cycle.number).call
        next_cycle
      end
    end

    private

    def close!(cycle)
      totals = Totals.new(user: @user, cycle_number: cycle.number).call

      Installment.joins(:card_purchase)
                 .where(card_purchases: { user_id: @user.id }, cycle_number: cycle.number)
                 .update_all(cycle_id: cycle.id)
      FixedExpensePayment.joins(:fixed_expense)
                         .where(fixed_expenses: { user_id: @user.id }, cycle_number: cycle.number)
                         .update_all(cycle_id: cycle.id)

      cycle.update!(
        closed_at:            Time.current,
        total_income:         cycle.expected_income,
        total_own_cards:      totals.own_cards,
        total_third_party:    totals.third_party,
        total_fixed_expenses: totals.fixed_expenses,
      )
    end
  end
end
