class CardInstallmentsController < ApiController
  ITEMS_LIMIT = 10

  before_action :load_card

  def index
    month = parse_month(params[:month]) || Date.current.beginning_of_month

    card_scope  = Installment.joins(:card_purchase).where(card_purchases: { card_id: @card.id })
    open_scope  = card_scope.where(cycle_id: nil)
    month_scope = card_scope.where(due_month: month)

    month_count   = month_scope.count
    month_records = month_scope.order(due_month: :asc, number: :asc).limit(ITEMS_LIMIT).includes(:card_purchase)

    closed_purchase_ids = closed_purchase_ids_for(month_records)

    render json: {
      month:                       month,
      month_total:                 month_scope.sum(:amount).to_f,
      month_total_for_summary:     month_scope
                                     .where(card_purchases: { excluded_from_summary: false })
                                     .sum(:amount).to_f,
      total_open:                  open_scope.sum(:amount).to_f,
      month_installments:          month_records.map { |i| serialize(i, closed_purchase_ids) },
      month_installments_overflow: [month_count - ITEMS_LIMIT, 0].max,
    }
  end

  private

  def load_card
    @card = current_user.cards.find_by(id: params[:card_id])
    return if @card

    render json: { errors: ["cartão não encontrado"] }, status: :not_found
  end

  # Resolve em UMA query quais purchase_ids têm pelo menos uma parcela
  # já fechada (cycle_id NOT NULL) — usado pra setar `purchase_editable`
  # no payload sem fazer N+1 por item da listagem.
  def closed_purchase_ids_for(records)
    purchase_ids = records.map(&:card_purchase_id).uniq
    return Set.new if purchase_ids.empty?

    Installment
      .where(card_purchase_id: purchase_ids)
      .where.not(cycle_id: nil)
      .pluck(:card_purchase_id)
      .to_set
  end

  def serialize(installment, closed_purchase_ids)
    purchase = installment.card_purchase

    {
      id:                    installment.id,
      number:                installment.number,
      installments_count:    purchase.installments_count,
      amount:                installment.amount.to_f,
      due_month:             installment.due_month,
      description:           purchase.description,
      purchase_id:           purchase.id,
      purchase_total_amount: purchase.total_amount.to_f,
      purchase_editable:     !closed_purchase_ids.include?(purchase.id),
      excluded_from_summary: purchase.excluded_from_summary,
    }
  end

  def parse_month(value)
    return nil if value.blank?

    Date.parse(value).beginning_of_month
  rescue ArgumentError
    nil
  end
end
