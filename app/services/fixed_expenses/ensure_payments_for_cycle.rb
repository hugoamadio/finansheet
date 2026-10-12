module FixedExpenses
  # Idempotente: garante que cada FixedExpense ativa do user tenha um
  # FixedExpensePayment no ciclo. Não toca payments existentes (preserva
  # edições pontuais, como zerar uma conta que não aconteceu).
  #
  # Ciclo fechado não ganha payments novos. Parcelada só gera payment
  # enquanto a parcela calculada cai em [1..installments_count].
  class EnsurePaymentsForCycle
    def initialize(user:, cycle_number:)
      @user = user
      @cycle_number = cycle_number
    end

    def call
      return if @user.cycles.closed.exists?(number: @cycle_number)

      @user.fixed_expenses.active.find_each do |expense|
        next unless self.class.applies?(expense, @cycle_number)

        FixedExpensePayment.find_or_create_by(fixed_expense_id: expense.id, cycle_number: @cycle_number) do |payment|
          payment.amount = expense.amount
        end
      end
    end

    # Número da parcela no ciclo (nil pra recorrentes e fora do range).
    def self.installment_number_for(expense, cycle_number)
      return nil unless expense.parceled?

      offset = cycle_number - expense.start_cycle_number
      return nil if offset.negative?

      number = expense.installments_paid.to_i + offset + 1
      number > expense.installments_count.to_i ? nil : number
    end

    def self.applies?(expense, cycle_number)
      !expense.parceled? || installment_number_for(expense, cycle_number).present?
    end
  end
end
