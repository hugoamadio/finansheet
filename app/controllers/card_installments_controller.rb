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

    render json: {
      month:                       month,
      month_total:                 month_scope.sum(:amount).to_f,
      total_open:                  open_scope.sum(:amount).to_f,
      month_installments:          month_records.map { |i| serialize(i) },
      month_installments_overflow: [month_count - ITEMS_LIMIT, 0].max,
    }
  end

  private

  def load_card
    @card = current_user.cards.find_by(id: params[:card_id])
    return if @card

    render json: { errors: ["cartão não encontrado"] }, status: :not_found
  end

  def serialize(installment)
    {
      id:                 installment.id,
      number:             installment.number,
      installments_count: installment.card_purchase.installments_count,
      amount:             installment.amount.to_f,
      due_month:          installment.due_month,
      description:        installment.card_purchase.description,
    }
  end

  def parse_month(value)
    return nil if value.blank?

    Date.parse(value).beginning_of_month
  rescue ArgumentError
    nil
  end
end
