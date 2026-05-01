module FixedExpenses
  # Idempotente: garante que cada FixedExpense ativa do user tenha um
  # FixedExpensePayment para o mês de referência. Não toca payments
  # existentes (preserva edições pontuais e snapshots).
  #
  # Skip se o mês já tem ciclo fechado — histórico não pode ganhar payments
  # novos retroativamente.
  #
  # Para parceladas (installments_count presente): cria apenas se a parcela
  # calculada cai dentro de [1..installments_count]. Antes do start_month
  # ou após a última parcela, não cria.
  class EnsurePaymentsForMonth
    def initialize(user:, reference_month:)
      @user = user
      @reference_month = reference_month
    end

    def call
      return if cycle_closed?

      @user.fixed_expenses.active.find_each do |expense|
        next unless should_create?(expense)

        FixedExpensePayment.find_or_create_by(
          fixed_expense_id: expense.id,
          reference_month:  @reference_month,
        ) do |payment|
          payment.amount = expense.amount
        end
      end
    end

    # Número da parcela atual no mês de referência (nil pra recorrentes,
    # ou pra meses fora do range [start_month .. última parcela]).
    # Útil pro controller serializar "5/10" no payload.
    def self.installment_number_for(expense, reference_month)
      return nil unless expense.parceled?

      offset = months_between(expense.start_month, reference_month)
      # Mês antes do start_month = parcela já paga; não retroage.
      return nil if offset < 0

      number = expense.installments_paid.to_i + offset + 1
      return nil if number > expense.installments_count.to_i

      number
    end

    def self.months_between(from, to)
      ((to.year * 12 + to.month) - (from.year * 12 + from.month))
    end

    private

    def cycle_closed?
      @user.cycles.exists?(reference_month: @reference_month)
    end

    def should_create?(expense)
      return true unless expense.parceled?

      self.class.installment_number_for(expense, @reference_month).present?
    end
  end
end
