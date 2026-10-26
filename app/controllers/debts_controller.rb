class DebtsController < ApiController
  include CycleParam

  # GET /api/debts?cycle=N — quanto cada pessoa deve + nomes já usados.
  # Ciclo futuro (prévia) soma o que cai até ele; ciclo fechado mostra o de
  # hoje (o que ainda não foi devolvido até o ciclo aberto).
  def index
    until_cycle = [cycle_number_param, current_user.open_cycle.number].max
    query = Debts::Query.new(user: current_user, until_cycle:)

    render json: {
      until_cycle:,
      debts:       query.call.map { |debt| serialize(debt) },
      known_names: query.known_names,
    }
  end

  # POST /api/debts/reimburse { installment_ids: [...] }
  def reimburse
    count = Debts::ReimburseService.new(user: current_user, installment_ids: params.require(:installment_ids)).call
    render json: { reimbursed: count }
  end

  private

  def serialize(debt)
    {
      name:  debt.name,
      total: debt.total.to_f,
      items: debt.items.map { |item| item.to_h.merge(amount: item.amount.to_f) },
    }
  end
end
