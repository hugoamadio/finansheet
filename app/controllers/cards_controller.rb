class CardsController < ApiController
  before_action :load_card, only: [:update, :destroy]

  def index
    cards = current_user.cards.order(:created_at)
    render json: { cards: cards.map { |c| serialize(c) } }
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
end
