class CyclesController < ApiController
  def close
    month = parse_month(params[:month])
    return render json: { errors: ["mês inválido"] }, status: :unprocessable_entity unless month

    cycle = Cycles::CloseService.new(user: current_user, reference_month: month).call
    render json: { cycle: serialize(cycle) }, status: :created
  rescue ActiveRecord::RecordInvalid => e
    render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
  end

  private

  def serialize(cycle)
    {
      id:                           cycle.id,
      reference_month:              cycle.reference_month,
      closed_at:                    cycle.closed_at,
      total_income:                 cycle.total_income.to_f,
      total_expenses:               cycle.total_expenses.to_f,
      installments_count:           cycle.installments.count,
      fixed_expense_payments_count: cycle.fixed_expense_payments.count,
    }
  end

  def parse_month(value)
    return nil if value.blank?

    Date.parse(value).beginning_of_month
  rescue ArgumentError
    nil
  end
end
