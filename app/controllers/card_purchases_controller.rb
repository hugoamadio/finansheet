class CardPurchasesController < ApiController
  before_action :load_card
  before_action :load_purchase, only: [:update, :destroy, :third_party, :prepay, :undo_prepay, :cancel_remaining]

  def create
    form = CardPurchaseForm.new(
      user:               current_user,
      card:               @card,
      description:        purchase_params[:description],
      total_amount:       purchase_params[:total_amount],
      installments_count: purchase_params[:installments_count],
      installments_paid:  purchase_params[:installments_paid],
      purchased_on:       purchase_params[:purchased_on].presence,
      third_party_name:   purchase_params[:third_party_name],
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

  # PATCH .../third_party { third_party_name: "Mãe" | "" }
  # Marca ou desmarca compra de outra pessoa. Permitido mesmo com parcela em
  # ciclo fechado: não muda valores, e o retrato dos ciclos fechados fica
  # como foi gravado na virada.
  def third_party
    @purchase.update!(third_party_name: params[:third_party_name])
    render json: { purchase: serialize(@purchase) }
  end

  # POST .../prepay — parcelas futuras vêm para o ciclo aberto.
  def prepay
    Purchases::PrepayService.new(card_purchase: @purchase).call
    render json: { purchase: serialize(@purchase.reload) }
  rescue Purchases::PrepayService::NothingToPrepay
    render json: { errors: ["essa compra não tem parcelas futuras"] }, status: :unprocessable_entity
  end

  # DELETE .../prepay — devolve as parcelas antecipadas aos ciclos de origem.
  def undo_prepay
    Purchases::UndoPrepayService.new(card_purchase: @purchase).call
    render json: { purchase: serialize(@purchase.reload) }
  rescue Purchases::UndoPrepayService::NothingToUndo
    render json: { errors: ["não há quitação para desfazer neste ciclo"] }, status: :unprocessable_entity
  end

  # POST .../cancel_remaining { from_number }
  def cancel_remaining
    Purchases::CancelRemainingService.new(card_purchase: @purchase, from_number: params.require(:from_number)).call
    render json: { purchase: serialize(@purchase.reload) }
  rescue Purchases::CancelRemainingService::InvalidStart => e
    render json: { errors: [e.message] }, status: :unprocessable_entity
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
    params.require(:purchase).permit(:description, :total_amount, :installments_count, :installments_paid, :purchased_on, :third_party_name)
  end

  def update_params
    params.require(:purchase).permit(:total_amount, :installments_count)
  end

  def serialize(purchase)
    {
      id:                 purchase.id,
      card_id:            purchase.card_id,
      description:        purchase.description,
      total_amount:       purchase.total_amount,
      installments_count: purchase.installments_count,
      installments_paid:  purchase.installments_paid,
      purchased_on:       purchase.purchased_on,
      third_party_name:   purchase.third_party_name,
      cancelled_at:       purchase.cancelled_at,
      installments: purchase.installments.order(:number).map { |i|
        { id: i.id, number: i.number, amount: i.amount, cycle_number: i.cycle_number }
      },
    }
  end
end
