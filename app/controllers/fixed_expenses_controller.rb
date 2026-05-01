class FixedExpensesController < ApiController
  before_action :load_fixed_expense, only: [:update, :destroy]

  # GET /api/fixed_expenses?month=YYYY-MM-DD
  # Retorna a lista de payments do mês (uma linha por FixedExpense ativa),
  # criando os faltantes via EnsurePaymentsForMonth quando o mês está aberto.
  def index
    month = parse_month(params[:month]) || Date.current.beginning_of_month

    FixedExpenses::EnsurePaymentsForMonth.new(
      user: current_user, reference_month: month
    ).call

    payments = month_payments(month)
    total      = payments.sum(&:amount).to_f
    paid_total = payments.select(&:paid_at).sum(&:amount).to_f

    render json: {
      month:         month,
      cycle_closed:  cycle_closed?(month),
      total:         total,
      paid_total:    paid_total,
      pending_total: (total - paid_total).round(2),
      items:         payments.map { |p| serialize_payment(p, month) },
    }
  end

  # POST /api/fixed_expenses { fixed_expense: {...}, month: "YYYY-MM-DD" }
  def create
    attrs = create_params
    fe = current_user.fixed_expenses.new(attrs.merge(active: true))

    if fe.save
      # Re-roda EnsurePayments pro mês visualizado: pra recorrente cria 1
      # payment; pra parcelada, só cria se o mês cai dentro do range.
      month = parse_month(params[:month]) || Date.current.beginning_of_month
      FixedExpenses::EnsurePaymentsForMonth.new(user: current_user, reference_month: month).call
      render json: { fixed_expense: serialize_expense(fe) }, status: :created
    else
      render json: { errors: fe.errors.full_messages }, status: :unprocessable_entity
    end
  end

  # PATCH /api/fixed_expenses/:id
  # Atualiza a definição. Se `amount` mudou, propaga pros payments abertos
  # (cycle_id IS NULL) — fechados ficam intactos por design (reajuste vale a
  # partir do mês corrente, não retroage).
  def update
    new_amount = fixed_expense_params[:amount]

    if @fixed_expense.update(fixed_expense_params)
      if new_amount.present?
        @fixed_expense.payments.where(cycle_id: nil).update_all(amount: @fixed_expense.amount)
      end
      render json: { fixed_expense: serialize_expense(@fixed_expense) }
    else
      render json: { errors: @fixed_expense.errors.full_messages }, status: :unprocessable_entity
    end
  end

  # DELETE /api/fixed_expenses/:id
  # Soft delete: active=false preserva histórico. Remove apenas payments
  # abertos do mês corrente em diante (limpeza de "futuro" — não polui).
  def destroy
    ActiveRecord::Base.transaction do
      @fixed_expense.update!(active: false)
      @fixed_expense.payments
                    .where(cycle_id: nil)
                    .where("reference_month >= ?", Date.current.beginning_of_month)
                    .destroy_all
    end
    render json: { success: true }
  end

  private

  def load_fixed_expense
    @fixed_expense = current_user.fixed_expenses.find_by(id: params[:id])
    return if @fixed_expense

    render json: { errors: ["conta fixa não encontrada"] }, status: :not_found
  end

  # Update permite só os campos seguros de editar. Campos de parcelamento
  # (installments_count/paid, start_month) são imutáveis após criação —
  # mexer neles corromperia o cálculo do número da parcela e payments
  # existentes. Pra mudar parcelas, remover e recriar.
  def fixed_expense_params
    params.require(:fixed_expense).permit(:name, :amount, :due_day)
  end

  # Create aceita também os campos de parcelamento. Frontend manda
  # `next_due_month` (mês onde a parcela `paid+1` cai) — mapeamos pra
  # `start_month`. Recorrentes: tudo nil.
  def create_params
    raw = params.require(:fixed_expense).permit(
      :name, :amount, :due_day, :installments_count, :installments_paid, :next_due_month
    )

    parceled = raw[:installments_count].present?
    {
      name:               raw[:name],
      amount:             raw[:amount],
      due_day:            raw[:due_day],
      installments_count: parceled ? raw[:installments_count].to_i : nil,
      installments_paid:  parceled ? raw[:installments_paid].to_i  : 0,
      start_month:        parceled ? parse_month(raw[:next_due_month]) : nil,
    }
  end

  def parse_month(value)
    return nil if value.blank?

    Date.parse(value).beginning_of_month
  rescue ArgumentError
    nil
  end

  def cycle_closed?(month)
    current_user.cycles.exists?(reference_month: month)
  end

  def month_payments(month)
    FixedExpensePayment
      .joins(:fixed_expense)
      .where(fixed_expenses: { user_id: current_user.id, active: true })
      .where(reference_month: month)
      .includes(:fixed_expense)
      .order(Arel.sql("fixed_expenses.due_day ASC NULLS LAST, fixed_expenses.name ASC"))
  end

  def serialize_payment(payment, reference_month)
    expense = payment.fixed_expense
    number  = FixedExpenses::EnsurePaymentsForMonth.installment_number_for(expense, reference_month)

    {
      payment_id:         payment.id,
      expense_id:         expense.id,
      name:               expense.name,
      due_day:            expense.due_day,
      amount:             payment.amount.to_f,
      paid_at:            payment.paid_at,
      cycle_closed:       payment.cycle_id.present?,
      installment_number: number,
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
      start_month:        fe.start_month,
    }
  end
end
