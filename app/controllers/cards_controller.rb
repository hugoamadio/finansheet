class CardsController < ApiController
  before_action :load_card, only: [:update, :destroy]

  def index
    month = parse_month(params[:month]) || Date.current.beginning_of_month
    cards = current_user.cards.order(:created_at)

    has_earlier_data = Installment
      .joins(:card_purchase)
      .where(card_purchases: { user_id: current_user.id })
      .where("due_month < ?", month)
      .exists?

    month_cycle = current_user.cycles.find_by(reference_month: month)

    render json: {
      month:            month,
      has_earlier_data: has_earlier_data,
      month_closed_at:  month_cycle&.closed_at,
      cards:            cards.map { |c| serialize_with_month(c, month) },
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

  ITEMS_LIMIT = 10

  def serialize_with_month(card, month)
    card_scope = Installment
      .joins(:card_purchase)
      .where(card_purchases: { card_id: card.id })

    open_scope  = card_scope.where(cycle_id: nil)
    month_scope = card_scope.where(due_month: month)

    month_count   = month_scope.count
    month_records = month_scope.order(due_month: :asc, number: :asc).limit(ITEMS_LIMIT).includes(:card_purchase)

    serialize(card).merge(
      month_total:        month_scope.sum(:amount).to_f,
      total_open:         open_scope.sum(:amount).to_f,
      month_installments: month_records.map { |i|
        {
          id:                 i.id,
          number:             i.number,
          installments_count: i.card_purchase.installments_count,
          amount:             i.amount.to_f,
          due_month:          i.due_month,
          description:        i.card_purchase.description,
        }
      },
      month_installments_overflow: [month_count - ITEMS_LIMIT, 0].max,
    )
  end

  def parse_month(value)
    return nil if value.blank?

    Date.parse(value).beginning_of_month
  rescue ArgumentError
    nil
  end
end
