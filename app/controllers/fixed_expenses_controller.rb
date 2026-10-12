class FixedExpensesController < ApiController
  include CycleParam

  before_action :load_fixed_expense, only: [:update, :destroy]

  # GET /api/fixed_expenses?cycle=N
  # Uma linha por pagamento do ciclo. Ciclos ainda não fechados ganham os
  # pagamentos que faltam (EnsurePaymentsForCycle é idempotente). Fechados
  # mostram o que ficou gravado, inclusive de contas já removidas.
  def index
    number = cycle_number_param
    FixedExpenses::EnsurePaymentsForCycle.new(user: current_user, cycle_number: number).call

    payments   = cycle_payments(number)
    total      = payments.sum(&:amount).to_f
    paid_total = payments.select(&:paid_at).sum(&:amount).to_f

    render json: {
      cycle:         number,
      editable:      number == current_user.open_cycle.number,
      total:         total,
      paid_total:    paid_total,
      pending_total: (total - paid_total).round(2),
      items:         payments.map { |p| serialize_payment(p, number) },
    }
  end

  # POST /api/fixed_expenses { fixed_expense: {...} }
  # Parcelada: a próxima parcela (installments_paid + 1) cai no ciclo aberto.
  def create
    open_number = current_user.open_cycle.number
    fe = current_user.fixed_expenses.new(create_params(open_number).merge(active: true))

    if fe.save
      FixedExpenses::EnsurePaymentsForCycle.new(user: current_user, cycle_number: open_number).call
      render json: { fixed_expense: serialize_expense(fe) }, status: :created
    else
      render json: { errors: fe.errors.full_messages }, status: :unprocessable_entity
    end
  end

  # PATCH /api/fixed_expenses/:id
  # Se `amount` mudou, propaga pros payments ainda não fechados que seguiam o
  # valor antigo — fechados e ajustes pontuais do ciclo (ex.: zerado) ficam
  # como estão.
  def update
    old_amount = @fixed_expense.amount

    if @fixed_expense.update(fixed_expense_params)
      if @fixed_expense.amount != old_amount
        @fixed_expense.payments.where(cycle_id: nil, amount: old_amount).update_all(amount: @fixed_expense.amount)
      end
      render json: { fixed_expense: serialize_expense(@fixed_expense) }
    else
      render json: { errors: @fixed_expense.errors.full_messages }, status: :unprocessable_entity
    end
  end

  # DELETE /api/fixed_expenses/:id
  # Soft delete: active=false preserva histórico. Remove os payments ainda
  # não fechados (ciclo aberto e futuros).
  def destroy
    ActiveRecord::Base.transaction do
      @fixed_expense.update!(active: false)
      @fixed_expense.payments.where(cycle_id: nil).destroy_all
    end
    render json: { success: true }
  end

  private

  def load_fixed_expense
    @fixed_expense = current_user.fixed_expenses.find_by(id: params[:id])
    return if @fixed_expense

    render json: { errors: ["conta fixa não encontrada"] }, status: :not_found
  end

  # Campos de parcelamento são imutáveis após criação — pra mudar, remover
  # e recriar.
  def fixed_expense_params
    params.require(:fixed_expense).permit(:name, :amount, :due_day)
  end

  def create_params(open_number)
    raw = params.require(:fixed_expense).permit(:name, :amount, :due_day, :installments_count, :installments_paid)

    parceled = raw[:installments_count].present?
    {
      name:               raw[:name],
      amount:             raw[:amount],
      due_day:            raw[:due_day],
      installments_count: parceled ? raw[:installments_count].to_i : nil,
      installments_paid:  parceled ? raw[:installments_paid].to_i  : 0,
      start_cycle_number: parceled ? open_number : nil,
    }
  end

  def cycle_payments(number)
    FixedExpensePayment
      .joins(:fixed_expense)
      .where(fixed_expenses: { user_id: current_user.id })
      .where(cycle_number: number)
      .includes(:fixed_expense)
      .order(Arel.sql("fixed_expenses.due_day ASC NULLS LAST, fixed_expenses.name ASC"))
  end

  def serialize_payment(payment, number)
    expense = payment.fixed_expense

    {
      payment_id:         payment.id,
      expense_id:         expense.id,
      name:               expense.name,
      due_day:            expense.due_day,
      amount:             payment.amount.to_f,
      expense_amount:     expense.amount.to_f,
      paid_at:            payment.paid_at,
      cycle_closed:       payment.cycle_id.present?,
      installment_number: FixedExpenses::EnsurePaymentsForCycle.installment_number_for(expense, number),
      installments_count: expense.installments_count,
    }
  end

  def serialize_expense(fe)
    {
      id:                 fe.id,
      name:               fe.name,
      amount:             fe.amount.to_f,
      due_day:            fe.due_day,
      active:             fe.active,
      installments_count: fe.installments_count,
      installments_paid:  fe.installments_paid,
      start_cycle_number: fe.start_cycle_number,
    }
  end
end
