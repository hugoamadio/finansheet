class FixedExpensePaymentsController < ApiController
  before_action :load_payment

  # PATCH /api/fixed_expense_payments/:id
  # Aceita: amount (edição pontual no ciclo, inclusive 0) e/ou paid (toggle).
  # Recusa fora do ciclo aberto — fechados são imutáveis e futuros ainda não chegaram.
  def update
    unless @payment.cycle_number == current_user.open_cycle.number
      render json: { errors: ["só dá para alterar contas do ciclo aberto"] },
             status: :unprocessable_entity
      return
    end

    attrs = {}
    attrs[:amount]  = params[:amount] if params.key?(:amount)
    if params.key?(:paid)
      attrs[:paid_at] = ActiveModel::Type::Boolean.new.cast(params[:paid]) ? Time.current : nil
    end

    if @payment.update(attrs)
      render json: { payment: serialize(@payment) }
    else
      render json: { errors: @payment.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def load_payment
    @payment = FixedExpensePayment
                 .joins(:fixed_expense)
                 .where(fixed_expenses: { user_id: current_user.id })
                 .find_by(id: params[:id])
    return if @payment

    render json: { errors: ["payment não encontrado"] }, status: :not_found
  end

  def serialize(p)
    {
      payment_id:   p.id,
      expense_id:   p.fixed_expense_id,
      amount:       p.amount.to_f,
      paid_at:      p.paid_at,
      cycle_number: p.cycle_number,
      cycle_closed: p.closed?,
    }
  end
end
