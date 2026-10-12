# Converte o modelo "ciclo = mês" para "ciclo = número". Regras (spec,
# seção "Conversão dos dados existentes"):
#   - ciclos fechados, em ordem de mês, viram 1..k;
#   - o ciclo aberto vira k+1 e corresponde ao 1º mês sem ciclo fechado a
#     partir do mês de CONVERSION_TODAY;
#   - parcela/pagamento aberto cai em k+1 + meses depois do mês aberto.
# Falha (e desfaz tudo) se o total de algum ciclo fechado não bater.
class ConvertMonthsToCycleNumbers < ActiveRecord::Migration[8.1]
  class ConversionMismatch < StandardError; end

  # Dia que a conversão retrata: o último uso do app no modelo por mês.
  # Usar a data do dia faria o resultado mudar conforme o mês em que a
  # migration rodasse (em novembro, outubro deixaria de ser o ciclo aberto).
  CONVERSION_TODAY = Date.parse(ENV.fetch("CONVERSION_TODAY", "2026-10-12"))

  # Modelos locais: a migration não pode depender das classes do app, que
  # mudam nos tasks seguintes.
  class MUser < ActiveRecord::Base;         self.table_name = "users"; end
  class MCycle < ActiveRecord::Base;        self.table_name = "cycles"; end
  class MIncome < ActiveRecord::Base;       self.table_name = "incomes"; end
  class MPurchase < ActiveRecord::Base;     self.table_name = "card_purchases"; end
  class MInstallment < ActiveRecord::Base;  self.table_name = "installments"; end
  class MFixedExpense < ActiveRecord::Base; self.table_name = "fixed_expenses"; end
  class MPayment < ActiveRecord::Base;      self.table_name = "fixed_expense_payments"; end

  MODELS = [MUser, MCycle, MIncome, MPurchase, MInstallment, MFixedExpense, MPayment].freeze

  def up
    MODELS.each(&:reset_column_information)
    MUser.order(:created_at).each { |user| convert_user(user) }
    verify!
  end

  def down
    MODELS.each(&:reset_column_information)
    MCycle.where(closed_at: nil).delete_all
    MCycle.update_all(number: nil, started_at: nil, expected_income: 0, total_income: 0,
                      total_own_cards: 0, total_third_party: 0, total_fixed_expenses: 0)
    MInstallment.update_all(cycle_number: nil, original_cycle_number: nil, reimbursed_at: nil)
    MPurchase.update_all(third_party_name: nil, cancelled_at: nil)
    MFixedExpense.update_all(start_cycle_number: nil)
    MPayment.update_all(cycle_number: nil)
  end

  private

  def convert_user(user)
    closed  = MCycle.where(user_id: user.id).where.not(closed_at: nil).order(:reference_month).to_a
    incomes = MIncome.where(user_id: user.id).to_h { |i| [i.reference_month, i.amount] }

    previous_end = user.created_at
    closed.each.with_index(1) do |cycle, number|
      cycle.update_columns(number:, started_at: previous_end,
                           total_income: incomes.fetch(cycle.reference_month, 0))
      previous_end = cycle.closed_at
    end

    open_number = closed.size + 1
    open_month  = first_open_month(closed.map(&:reference_month))
    MCycle.create!(user_id: user.id, number: open_number, started_at: previous_end,
                   reference_month: open_month, expected_income: incomes.fetch(open_month, 0))

    number_by_cycle_id = closed.to_h { |c| [c.id, c.number] }
    convert_installments(user, number_by_cycle_id, open_number, open_month)
    convert_payments(user, number_by_cycle_id, open_number, open_month)
    convert_fixed_expenses(user, open_number, open_month)
    convert_third_party(user, closed)
    snapshot_totals!(closed)

    (incomes.keys - closed.map(&:reference_month) - [open_month]).each do |month|
      say "renda de #{month} do usuário #{user.id} descartada (fora dos ciclos)"
    end
    say "usuário #{user.id}: #{closed.size} ciclo(s) fechado(s), ciclo aberto nº #{open_number} (#{open_month})"
  end

  def convert_installments(user, number_by_cycle_id, open_number, open_month)
    purchase_ids = MPurchase.where(user_id: user.id).select(:id)
    MInstallment.where(card_purchase_id: purchase_ids).find_each do |inst|
      number = if inst.cycle_id
                 number_by_cycle_id.fetch(inst.cycle_id)
               else
                 open_number + [months_between(open_month, inst.due_month), 0].max
               end
      inst.update_columns(cycle_number: number)
    end
  end

  def convert_payments(user, number_by_cycle_id, open_number, open_month)
    expense_ids = MFixedExpense.where(user_id: user.id).select(:id)
    MPayment.where(fixed_expense_id: expense_ids).find_each do |payment|
      if payment.cycle_id
        payment.update_columns(cycle_number: number_by_cycle_id.fetch(payment.cycle_id))
      elsif payment.reference_month < open_month
        raise ConversionMismatch, "pagamento #{payment.id} (#{payment.reference_month}) já pago seria descartado" if payment.paid_at
        say "pagamento #{payment.id} (#{payment.reference_month}) sem ciclo e anterior ao ciclo aberto: descartado"
        payment.delete
      else
        payment.update_columns(cycle_number: open_number + months_between(open_month, payment.reference_month))
      end
    end
  end

  def convert_fixed_expenses(user, open_number, open_month)
    MFixedExpense.where(user_id: user.id).where.not(start_month: nil).find_each do |fe|
      fe.update_columns(start_cycle_number: open_number + months_between(open_month, fe.start_month))
    end
  end

  # "Olho riscado" vira compra de outra pessoa. O que já fechou é tratado
  # como devolvido (decisão confirmada com o usuário).
  def convert_third_party(user, closed)
    purchases = MPurchase.where(user_id: user.id, excluded_from_summary: true)
    purchases.update_all(third_party_name: "Outra pessoa")

    closed_at_by_cycle_id = closed.to_h { |c| [c.id, c.closed_at] }
    MInstallment.where(card_purchase_id: purchases.select(:id)).where.not(cycle_id: nil).find_each do |inst|
      inst.update_columns(reimbursed_at: closed_at_by_cycle_id.fetch(inst.cycle_id))
    end
  end

  def snapshot_totals!(closed)
    closed.each do |cycle|
      installments = MInstallment.where(cycle_id: cycle.id)
      third_ids    = MPurchase.where(excluded_from_summary: true).select(:id)
      third        = installments.where(card_purchase_id: third_ids).sum(:amount)
      own          = installments.where.not(card_purchase_id: third_ids).sum(:amount)
      fixed        = MPayment.where(cycle_id: cycle.id).sum(:amount)

      unless own + third + fixed == cycle.total_expenses
        raise ConversionMismatch,
              "ciclo #{cycle.id} (#{cycle.reference_month}): #{own} + #{third} + #{fixed} != #{cycle.total_expenses}"
      end

      cycle.update_columns(total_own_cards: own, total_third_party: third, total_fixed_expenses: fixed)
    end
  end

  def verify!
    open_counts = MCycle.where(closed_at: nil).group(:user_id).count
    unless open_counts.size == MUser.count && open_counts.values.all?(1)
      raise ConversionMismatch, "esperado um ciclo aberto por usuário: #{open_counts.inspect}"
    end
    raise ConversionMismatch, "ciclo sem número" if MCycle.where(number: nil).exists?
    raise ConversionMismatch, "parcela sem cycle_number" if MInstallment.where(cycle_number: nil).exists?
    raise ConversionMismatch, "pagamento sem cycle_number" if MPayment.where(cycle_number: nil).exists?
  end

  # Mesma regra do antigo User#next_open_cycle_month, a partir de CONVERSION_TODAY.
  def first_open_month(closed_months)
    candidate = CONVERSION_TODAY.beginning_of_month
    candidate = candidate >> 1 while closed_months.include?(candidate)
    candidate
  end

  def months_between(from, to)
    (to.year * 12 + to.month) - (from.year * 12 + from.month)
  end
end
