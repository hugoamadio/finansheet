class CyclesController < ApiController
  # GET /api/cycles — ciclo aberto (totais ao vivo) e fechados (retrato).
  def index
    open = current_user.open_cycle
    FixedExpenses::EnsurePaymentsForCycle.new(user: current_user, cycle_number: open.number).call

    render json: {
      open:     serialize_open(open),
      closed:   current_user.cycles.closed.order(number: :desc).map { |c| serialize_closed(c) },
      can_undo: Cycles::UndoTurnService.new(user: current_user).blocker.nil?,
    }
  end

  # PATCH /api/cycles/current { expected_income } — o "a receber" do ciclo aberto.
  def update_current
    cycle = current_user.open_cycle

    if cycle.update(expected_income: params.require(:expected_income))
      render json: { cycle: serialize_open(cycle) }
    else
      render json: { errors: cycle.errors.full_messages }, status: :unprocessable_entity
    end
  end

  # POST /api/cycles/current/turn { cycle_id }
  def turn
    new_cycle = Cycles::TurnService.new(user: current_user, cycle_id: params.require(:cycle_id)).call
    render json: { cycle: serialize_open(new_cycle) }, status: :created
  rescue Cycles::TurnService::AlreadyTurned
    render json: { errors: ["esse ciclo já foi virado"] }, status: :conflict
  end

  # POST /api/cycles/last/undo
  def undo
    cycle = Cycles::UndoTurnService.new(user: current_user).call
    render json: { cycle: serialize_open(cycle) }
  rescue Cycles::UndoTurnService::NotAllowed => e
    render json: { errors: [e.message] }, status: :unprocessable_entity
  end

  private

  def serialize_open(cycle)
    totals = Cycles::Totals.new(user: current_user, cycle_number: cycle.number).call

    {
      id:              cycle.id,
      number:          cycle.number,
      started_at:      cycle.started_at,
      expected_income: cycle.expected_income.to_f,
      own_cards:       totals.own_cards.to_f,
      third_party:     totals.third_party.to_f,
      fixed_expenses:  totals.fixed_expenses.to_f,
      balance:         (cycle.expected_income - totals.own_cards - totals.fixed_expenses).to_f,
    }
  end

  def serialize_closed(cycle)
    {
      id:             cycle.id,
      number:         cycle.number,
      started_at:     cycle.started_at,
      closed_at:      cycle.closed_at,
      income:         cycle.total_income.to_f,
      own_cards:      cycle.total_own_cards.to_f,
      third_party:    cycle.total_third_party.to_f,
      fixed_expenses: cycle.total_fixed_expenses.to_f,
      balance:        (cycle.total_income - cycle.total_own_cards - cycle.total_fixed_expenses).to_f,
    }
  end
end
