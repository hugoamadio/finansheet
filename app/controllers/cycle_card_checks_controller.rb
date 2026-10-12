class CycleCardChecksController < ApiController
  before_action :load_card

  # PUT /api/cycles/current/cards/:card_id/check — "conferido ✓" no ciclo aberto.
  def create
    check = current_user.open_cycle.card_checks.find_or_create_by!(card: @card) do |c|
      c.checked_at = Time.current
    end
    render json: { card_id: @card.id, checked_at: check.checked_at }
  end

  # DELETE /api/cycles/current/cards/:card_id/check
  def destroy
    current_user.open_cycle.card_checks.where(card: @card).delete_all
    render json: { card_id: @card.id, checked_at: nil }
  end

  private

  def load_card
    @card = current_user.cards.find_by(id: params[:card_id])
    return if @card

    render json: { errors: ["cartão não encontrado"] }, status: :not_found
  end
end
