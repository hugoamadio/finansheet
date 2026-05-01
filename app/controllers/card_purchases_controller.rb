class CardPurchasesController < ApiController
  before_action :load_card
  before_action :load_purchase, only: [:update, :destroy, :toggle_excluded]

  def create
    form = CardPurchaseForm.new(
      user:               current_user,
      card:               @card,
      description:        purchase_params[:description],
      total_amount:       purchase_params[:total_amount],
      installments_count: purchase_params[:installments_count],
      installments_paid:  purchase_params[:installments_paid],
      purchased_on:       purchase_params[:purchased_on].presence,
      next_due_month:     purchase_params[:next_due_month].presence,
    )

    if form.save
      render json: { purchase: serialize(form.card_purchase) }, status: :created
    else
      render json: { errors: form.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    Purchases::UpdateService.new(
      card_purchase:      @purchase,
      total_amount:       update_params[:total_amount],
      installments_count: update_params[:installments_count],
    ).call

    render json: { purchase: serialize(@purchase.reload) }
  rescue Purchases::UpdateService::EditingClosedPurchase
    render json: { errors: ["compra com parcela em ciclo fechado não pode ser editada"] },
           status: :unprocessable_entity
  rescue ActiveRecord::RecordInvalid => e
    render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
  end

  def destroy
    Purchases::DestroyService.new(card_purchase: @purchase).call
    render json: { success: true }
  rescue Purchases::DestroyService::DestroyingClosedPurchase
    render json: { errors: ["compra com parcela em ciclo fechado não pode ser removida"] },
           status: :unprocessable_entity
  end

  # Flag visual — não altera valores das parcelas nem snapshot de ciclos
  # fechados. Por isso é permitido mesmo em compra "fechada".
  def toggle_excluded
    @purchase.update!(excluded_from_summary: ActiveModel::Type::Boolean.new.cast(params[:excluded_from_summary]))
    render json: { purchase: serialize(@purchase) }
  end

  private

  def load_card
    @card = current_user.cards.find_by(id: params[:card_id])
    return if @card

    render json: { errors: ["cartão não encontrado"] }, status: :not_found
  end

  def load_purchase
    @purchase = @card.card_purchases.find_by(id: params[:id])
    return if @purchase

    render json: { errors: ["compra não encontrada"] }, status: :not_found
  end

  def purchase_params
    params.require(:purchase).permit(:description, :total_amount, :installments_count, :installments_paid, :purchased_on, :next_due_month)
  end

  def update_params
    params.require(:purchase).permit(:total_amount, :installments_count)
  end

  def serialize(purchase)
    {
      id:                    purchase.id,
      card_id:               purchase.card_id,
      description:           purchase.description,
      total_amount:          purchase.total_amount,
      installments_count:    purchase.installments_count,
      installments_paid:     purchase.installments_paid,
      purchased_on:          purchase.purchased_on,
      excluded_from_summary: purchase.excluded_from_summary,
      installments: purchase.installments.order(:number).map { |i|
        { id: i.id, number: i.number, amount: i.amount, due_month: i.due_month }
      },
    }
  end
end
