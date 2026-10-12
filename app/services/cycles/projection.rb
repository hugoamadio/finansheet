module Cycles
  # Prévia dos próximos ciclos: o que já está comprometido (parcelas e
  # contas fixas pelo valor cadastrado) e a sobra prevista com a renda do
  # ciclo aberto. Só leitura — não grava nada.
  class Projection
    DEFAULT_COUNT = CycleParam::MAX_AHEAD

    Row = Data.define(:number, :own_cards, :third_party, :fixed_expenses, :expected_income) do
      def balance
        expected_income - own_cards - fixed_expenses
      end
    end

    def initialize(user:, count: DEFAULT_COUNT)
      @user  = user
      @count = count
    end

    def call
      open     = @user.open_cycle
      numbers  = (open.number + 1)..(open.number + @count)
      sums     = installment_sums(numbers)
      expenses = @user.fixed_expenses.active.to_a

      numbers.map do |number|
        Row.new(
          number:,
          own_cards:       sums.fetch([number, false], 0.to_d),
          third_party:     sums.fetch([number, true], 0.to_d),
          fixed_expenses:  expenses.select { |fe| FixedExpenses::EnsurePaymentsForCycle.applies?(fe, number) }
                                   .sum(0.to_d, &:amount),
          expected_income: open.expected_income,
        )
      end
    end

    private

    # { [cycle_number, de_terceiro?] => soma }
    def installment_sums(numbers)
      Installment.joins(:card_purchase)
                 .where(card_purchases: { user_id: @user.id }, cycle_number: numbers)
                 .group(:cycle_number, Arel.sql("card_purchases.third_party_name IS NOT NULL"))
                 .sum(:amount)
    end
  end
end
