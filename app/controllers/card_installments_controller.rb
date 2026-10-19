class CardInstallmentsController < ApiController
  include CycleParam

  before_action :load_card

  # GET /api/cards/:card_id/installments?cycle=N
  # Parcelas do cartão no ciclo + totais (todas, só as do usuário, e o que
  # cai nos ciclos seguintes) + ações permitidas por compra.
  def index
    number      = cycle_number_param
    open_number = current_user.open_cycle.number
    card_scope  = Installment.joins(:card_purchase).where(card_purchases: { card_id: @card.id })
    cycle_scope = card_scope.where(cycle_number: number)

    records = cycle_scope.includes(:card_purchase)
                         .order(Arel.sql("card_purchases.created_at DESC, installments.number ASC"))
                         .to_a
    actions = Purchases::Actions.for(records.map(&:card_purchase).uniq, open_number:)

    render json: {
      cycle:           number,
      cycle_total:     cycle_scope.sum(:amount).to_f,
      cycle_total_own: cycle_scope.where(card_purchases: { third_party_name: nil }).sum(:amount).to_f,
      future_total:    card_scope.where("installments.cycle_number > ?", number).sum(:amount).to_f,
      installments:    records.map { |i| serialize(i, actions.fetch(i.card_purchase_id)) },
    }
  end

  private

  def load_card
    @card = current_user.cards.find_by(id: params[:card_id])
    return if @card

    render json: { errors: ["cartão não encontrado"] }, status: :not_found
  end

  def serialize(installment, flags)
    purchase = installment.card_purchase

    {
      id:                    installment.id,
      number:                installment.number,
      installments_count:    purchase.installments_count,
      amount:                installment.amount.to_f,
      cycle_number:          installment.cycle_number,
      prepaid:               installment.original_cycle_number.present?,
      description:           purchase.description,
      purchase_id:           purchase.id,
      purchase_total_amount: purchase.total_amount.to_f,
      purchased_on:          purchase.purchased_on,
      third_party_name:      purchase.third_party_name,
      reimbursed:            installment.reimbursed_at.present?,
      cancelled:             purchase.cancelled_at.present?,
      refund:                purchase.refund?,
      editable:              flags.editable,
      can_prepay:            flags.can_prepay,
      can_undo_prepay:       flags.can_undo_prepay,
      cancel_from:           flags.cancel_from,
    }
  end
end
