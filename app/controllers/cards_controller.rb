class CardsController < ApiController
  before_action :load_card, only: [:update, :destroy]

  def index
    # Sem ?month=, o boot cai no ciclo ativo (1º aberto a partir de hoje).
    month = parse_month(params[:month]) || current_user.next_open_cycle_month
    cards = current_user.cards.order(:created_at)

    has_earlier_data = Installment
      .joins(:card_purchase)
      .where(card_purchases: { user_id: current_user.id })
      .where("due_month < ?", month)
      .exists?

    month_cycle  = current_user.cycles.find_by(reference_month: month)
    month_income = current_user.incomes.find_by(reference_month: month)

    render json: {
      month:            month,
      has_earlier_data: has_earlier_data,
      month_closed_at:  month_cycle&.closed_at,
      expected_income:  month_income&.amount&.to_f,
      cards:            cards.map { |c| serialize(c) },
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
    params.require(:card).permit(:name, :bank, :mode, :pay_day, :best_day)
  end

  def serialize(card)
    {
      id:       card.id,
      name:     card.name,
      bank:     card.bank,
      mode:     card.mode,
      pay_day:  card.pay_day,
      best_day: card.best_day,
    }
  end

  def parse_month(value)
    return nil if value.blank?

    Date.parse(value).beginning_of_month
  rescue ArgumentError
    nil
  end
end
