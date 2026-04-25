require "test_helper"

class Cycles::CloseServiceTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(email: "test@finansheet.local", password: "secret123")
    @card = @user.cards.create!(name: "Nubank", bank: "Nubank", mode: :credit, best_day: 29)
    @ref  = Date.new(2026, 4, 1) # mês de referência do ciclo a fechar
  end

  test "creates a closed cycle for the user with the given reference month" do
    cycle = Cycles::CloseService.new(user: @user, reference_month: @ref).call

    assert cycle.persisted?
    assert cycle.closed?
    assert_equal @ref,  cycle.reference_month
    assert_equal @user, cycle.user
    assert_in_delta Time.current, cycle.closed_at, 5
  end

  test "binds open installments with due_month <= reference_month" do
    purchase = @user.card_purchases.create!(card: @card, description: "X", total_amount: 300, installments_count: 3, purchased_on: Date.new(2026, 1, 1))
    purchase.installments.create!(number: 1, amount: 100, due_month: Date.new(2026, 3, 1)) # passada
    purchase.installments.create!(number: 2, amount: 100, due_month: Date.new(2026, 4, 1)) # mês corrente
    purchase.installments.create!(number: 3, amount: 100, due_month: Date.new(2026, 5, 1)) # futura

    cycle = Cycles::CloseService.new(user: @user, reference_month: @ref).call

    assert_equal 2, cycle.installments.count
    assert_equal [Date.new(2026, 3, 1), Date.new(2026, 4, 1)], cycle.installments.order(:due_month).pluck(:due_month)
  end

  test "does not bind installments already attached to another cycle" do
    other_cycle = @user.cycles.create!(reference_month: Date.new(2026, 3, 1), closed_at: 1.day.ago)
    purchase = @user.card_purchases.create!(card: @card, description: "X", total_amount: 100, installments_count: 1, purchased_on: Date.new(2026, 2, 1))
    inst = purchase.installments.create!(number: 1, amount: 100, due_month: Date.new(2026, 3, 1), cycle: other_cycle)

    cycle = Cycles::CloseService.new(user: @user, reference_month: @ref).call

    assert_equal other_cycle.id, inst.reload.cycle_id
    assert_equal 0, cycle.installments.count
  end

  test "binds open fixed_expense_payments of the reference_month" do
    fe = @user.fixed_expenses.create!(name: "Aluguel", amount: 1500)
    paid_now  = fe.payments.create!(amount: 1500, reference_month: @ref) # do mês
    other_mon = fe.payments.create!(amount: 1500, reference_month: Date.new(2026, 5, 1)) # outro mês

    cycle = Cycles::CloseService.new(user: @user, reference_month: @ref).call

    assert_equal 1, cycle.fixed_expense_payments.count
    assert_equal paid_now.id, cycle.fixed_expense_payments.first.id
    assert_nil   other_mon.reload.cycle_id
  end

  test "computes total_expenses from bound items" do
    purchase = @user.card_purchases.create!(card: @card, description: "X", total_amount: 200, installments_count: 2, purchased_on: Date.new(2026, 3, 1))
    purchase.installments.create!(number: 1, amount: 100, due_month: Date.new(2026, 4, 1))
    purchase.installments.create!(number: 2, amount: 100, due_month: Date.new(2026, 5, 1)) # futura, não entra

    fe = @user.fixed_expenses.create!(name: "Internet", amount: 150)
    fe.payments.create!(amount: 150, reference_month: @ref)

    cycle = Cycles::CloseService.new(user: @user, reference_month: @ref).call

    assert_equal 250.to_d, cycle.total_expenses
  end

  test "does not touch other user's data" do
    other_user = User.create!(email: "other@finansheet.local", password: "secret123")
    other_card = other_user.cards.create!(name: "Itaú", mode: :credit, best_day: 5)
    other_purchase = other_user.card_purchases.create!(card: other_card, description: "Y", total_amount: 100, installments_count: 1, purchased_on: Date.new(2026, 3, 1))
    other_inst = other_purchase.installments.create!(number: 1, amount: 100, due_month: Date.new(2026, 4, 1))

    Cycles::CloseService.new(user: @user, reference_month: @ref).call

    assert_nil other_inst.reload.cycle_id
  end

  test "rolls back transaction if cycle creation fails" do
    # cria cycle pré-existente pra forçar conflito de unique (user_id + reference_month)
    @user.cycles.create!(reference_month: @ref, closed_at: Time.current)

    fe   = @user.fixed_expenses.create!(name: "Aluguel", amount: 1500)
    pay  = fe.payments.create!(amount: 1500, reference_month: @ref)

    assert_raises(ActiveRecord::RecordInvalid) do
      Cycles::CloseService.new(user: @user, reference_month: @ref).call
    end

    assert_nil pay.reload.cycle_id, "payment should not be touched after rollback"
  end
end
