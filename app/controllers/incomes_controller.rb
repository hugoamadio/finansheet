class IncomesController < ApiController
  # GET /api/incomes?month=YYYY-MM-DD
  # Devolve { amount: 4000.0 } ou { amount: nil } se ainda não foi declarado.
  def show
    income = current_user.incomes.find_by(reference_month: month_param)
    render json: { amount: income&.amount&.to_f }
  end

  # PUT /api/incomes
  # Upsert por reference_month — single endpoint pra criar e editar; o
  # frontend não precisa rastrear se já existe registro pra aquele mês.
  def upsert
    return render_closed_month if month_closed?

    income = current_user.incomes.find_or_initialize_by(reference_month: month_param)
    income.amount = upsert_params[:amount]

    if income.save
      render json: { amount: income.amount.to_f }
    else
      render json: { errors: income.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def upsert_params
    params.require(:income).permit(:reference_month, :amount)
  end

  def month_param
    raw = params.dig(:income, :reference_month) || params[:month]
    Date.parse(raw.to_s).beginning_of_month
  rescue ArgumentError, TypeError
    nil
  end

  def month_closed?
    return false unless month_param

    current_user.cycles.exists?(reference_month: month_param)
  end

  def render_closed_month
    render json: { errors: ["mês fechado — não é possível alterar o ciclo"] },
           status: :unprocessable_entity
  end
end
