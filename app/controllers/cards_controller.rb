class CardsController < ApiController
  include CycleParam

  before_action :load_card, only: [:update, :destroy]

  # GET /api/cards?cycle=N — cabeçalho do ciclo visualizado + cartões, com
  # o "conferido" daquele ciclo.
  def index
    open    = current_user.open_cycle
    number  = cycle_number_param
    cycle   = current_user.cycles.find_by(number:)
    checked = cycle ? cycle.card_checks.pluck(:card_id) : []

    render json: {
      cycle: serialize_cycle(number, cycle, open),
      cards: current_user.cards.order(:created_at).map { |c| serialize(c).merge(checked: checked.include?(c.id)) },
    }
  end

  def create
    card = current_user.cards.create(card_params)
    if card.persisted?
      render json: { card: serialize(card) }, status: :created
    else
      render json: { errors: card.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    if @card.update(card_params)
      render json: { card: serialize(@card) }
    else
      render json: { errors: @card.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @card.destroy
    render json: { success: true }
  rescue ActiveRecord::DeleteRestrictionError
    render json: { errors: ["cartão possui compras lançadas e não pode ser removido"] }, status: :unprocessable_entity
  end

  private

  def load_card
    @card = current_user.cards.find_by(id: params[:id])
    return if @card

    render json: { errors: ["cartão não encontrado"] }, status: :not_found
  end

  def card_params
    params.require(:card).permit(:name, :bank, :mode, :pay_day, :best_day, :color)
  end

  def serialize(card)
    {
      id:       card.id,
      name:     card.name,
      bank:     card.bank,
      mode:     card.mode,
      pay_day:  card.pay_day,
      best_day: card.best_day,
      color:    card.color,
    }
  end

  def serialize_cycle(number, cycle, open)
    status = if cycle&.closed? then "closed"
             elsif number == open.number then "open"
             else "upcoming"
             end

    {
      number:          number,
      status:          status,
      started_at:      cycle&.started_at,
      closed_at:       cycle&.closed_at,
      expected_income: (cycle&.closed? ? cycle.total_income : open.expected_income).to_f,
      first_number:    current_user.cycles.minimum(:number),
      open_number:     open.number,
      max_number:      open.number + CycleParam::MAX_AHEAD,
    }
  end
end
