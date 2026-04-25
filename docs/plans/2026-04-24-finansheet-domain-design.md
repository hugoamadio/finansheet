# Finansheet — Design de domínio inicial

**Data:** 2026-04-24
**Status:** Validado, pronto pra implementação
**Autor:** Hugo + Claude (brainstorming)

## Contexto

Aplicação pessoal de controle financeiro para um usuário CLT que:

- Recebe salário 1x/mês
- Tem cartões de crédito/débito cadastrados
- Lança compras nos cartões (à vista ou parceladas)
- Lança contas fixas mensais (aluguel, água, internet, mercado, etc.) **fora** do cartão
- Aperta um botão "Virar Mês" pra fechar o ciclo financeiro pessoal e iniciar o próximo

A virada de mês precisa ser **versionada** — gerar um snapshot imutável do que estava em aberto no momento.

## Conceitos-chave

### Dois "ciclos" independentes

1. **Ciclo do cartão** (regra técnica): determinado pelo `best_day` do cartão. Compras antes ou no `best_day` entram na fatura corrente; depois, na próxima.
2. **Ciclo orçamentário** (decisão do usuário): determinado pelo botão "Virar Mês". Pode acontecer em qualquer dia. Define o que entra no snapshot daquele mês financeiro pessoal.

Esses dois conceitos **não estão acoplados**. Uma fatura de cartão pode ser dividida entre dois ciclos orçamentários (ex: usuário vira o mês no dia 24, mas o cartão só fecha dia 29 — compras feitas dias 25-29 estão na mesma fatura, mas vão pro próximo ciclo orçamentário).

### Regra do `due_month` da parcela

Calculado **no momento da compra**, não recalculado depois.

- 1ª parcela: `due_month` = mês da compra (sempre)
- Demais parcelas: `due_month` += 1 mês cada

`best_day` é só informativo (lembrete visual / alertas futuros). Não
afeta em que mês a parcela aparece.

### Imutabilidade pós-fechamento

- `Cycle` com `closed_at` preenchido: não pode ser editado nem deletado
- `Installment` e `FixedExpensePayment` com `cycle_id` preenchido: idem
- Em aberto (`cycle_id IS NULL`): editáveis livremente

## Modelo de dados

### Entidades existentes (já implementadas)

- `User` (UUID, email, password_digest)
- `Card` (UUID, name, bank, mode credit/debit, pay_day, best_day)
- `UserCard` (UUID, FKs UUID, vínculo N:N)

### Entidades novas

| Entidade | Propósito |
|---|---|
| `Cycle` | Snapshot do mês orçamentário fechado. Imutável após `closed_at`. |
| `FixedExpense` | Template recorrente: "Aluguel R$1500, dia 5". |
| `FixedExpensePayment` | Instância mensal de uma `FixedExpense`. Entra num `Cycle` quando paga. |
| `CardPurchase` | A compra original no cartão (descrição, valor total, número de parcelas, data). |
| `Installment` | Parcela individual da `CardPurchase`. Tem `due_month` e `cycle_id`. |

### Atributos novos no `User`

- `salary_amount` (decimal 12,2)
- `salary_day` (integer 1..31, com check constraint)

## Migrations (em ordem)

```ruby
# 1. add_salary_to_users
add_column :users, :salary_amount, :decimal, precision: 12, scale: 2
add_column :users, :salary_day,    :integer
add_check_constraint :users, "salary_day BETWEEN 1 AND 31", name: "users_salary_day_range"

# 2. create_cycles
create_table :cycles, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
  t.references :user,            type: :uuid, null: false, foreign_key: true
  t.date       :reference_month, null: false   # primeiro dia do mês de referência
  t.datetime   :closed_at                       # nil = ciclo "atual em aberto" (opcional)
  t.decimal    :total_income,    precision: 12, scale: 2, default: 0
  t.decimal    :total_expenses,  precision: 12, scale: 2, default: 0
  t.timestamps
end
add_index :cycles, [:user_id, :reference_month], unique: true

# 3. create_fixed_expenses (template recorrente)
create_table :fixed_expenses, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
  t.references :user,    type: :uuid, null: false, foreign_key: true
  t.text       :name,    null: false
  t.decimal    :amount,  precision: 12, scale: 2, null: false
  t.integer    :due_day                  # nullable, só pra UI/lembrete
  t.boolean    :active,  default: true, null: false
  t.timestamps
end

# 4. create_fixed_expense_payments (instância mensal)
create_table :fixed_expense_payments, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
  t.references :fixed_expense,   type: :uuid, null: false, foreign_key: true
  t.references :cycle,           type: :uuid, foreign_key: true   # nil = ainda em aberto
  t.decimal    :amount,          precision: 12, scale: 2, null: false
  t.date       :reference_month, null: false
  t.datetime   :paid_at
  t.timestamps
end
add_index :fixed_expense_payments, [:fixed_expense_id, :reference_month], unique: true

# 5. create_card_purchases
create_table :card_purchases, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
  t.references :user,        type: :uuid, null: false, foreign_key: true
  t.references :card,        type: :uuid, null: false, foreign_key: true
  t.text       :description, null: false
  t.decimal    :total_amount,       precision: 12, scale: 2, null: false
  t.integer    :installments_count, null: false, default: 1
  t.date       :purchased_on,       null: false
  t.timestamps
end

# 6. create_installments
create_table :installments, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
  t.references :card_purchase, type: :uuid, null: false, foreign_key: true
  t.references :cycle,         type: :uuid, foreign_key: true   # nil = em aberto
  t.integer    :number,    null: false   # 1..N
  t.decimal    :amount,    precision: 12, scale: 2, null: false
  t.date       :due_month, null: false   # primeiro dia do mês
  t.timestamps
end
add_index :installments, [:card_purchase_id, :number], unique: true
add_index :installments, [:cycle_id]
add_index :installments, [:due_month]
```

## Fluxo da virada de mês

`Cycles::CloseService` (em `app/services/cycles/close_service.rb`):

```
ActiveRecord::Base.transaction do
  cycle = Cycle.create!(user:, reference_month: Date.current.beginning_of_month, closed_at: Time.current)

  # 1. vincula installments em aberto cujo due_month <= reference_month
  Installment.joins(:card_purchase)
             .where(card_purchases: { user_id: user.id })
             .where(cycle_id: nil)
             .where("due_month <= ?", cycle.reference_month)
             .update_all(cycle_id: cycle.id)

  # 2. vincula fixed_expense_payments do mês corrente em aberto
  FixedExpensePayment.joins(:fixed_expense)
                     .where(fixed_expenses: { user_id: user.id })
                     .where(cycle_id: nil, reference_month: cycle.reference_month)
                     .update_all(cycle_id: cycle.id)

  # 3. recalcula totals e persiste no snapshot
  cycle.update!(
    total_income:   user.salary_amount,
    total_expenses: cycle.installments.sum(:amount) + cycle.fixed_expense_payments.sum(:amount),
  )
end
```

Equivalente Laravel: `app/Services/Cycles/CloseService.php` dentro de `DB::transaction()`.

## Imutabilidade — implementação

Concern reutilizável:

```ruby
# app/models/concerns/closable.rb
module Closable
  extend ActiveSupport::Concern

  included do
    before_update :prevent_change_when_closed
    before_destroy :prevent_destroy_when_closed
  end

  private

  def prevent_change_when_closed
    throw :abort if closed?
  end

  def prevent_destroy_when_closed
    throw :abort if closed?
  end

  def closed?
    raise NotImplementedError
  end
end
```

Cada model implementa `closed?`:

- `Cycle#closed?` → `closed_at.present?`
- `Installment#closed?` → `cycle_id.present? && cycle.closed?`
- `FixedExpensePayment#closed?` → idem

## Organização Rails (vs Laravel)

| Tipo | Pasta Rails | Equivalente Laravel |
|---|---|---|
| Models (associations, validations, lógica leve) | `app/models/` | `app/Models/` |
| Service objects (lógica multi-step transacional) | `app/services/<contexto>/<acao>_service.rb` | `app/Services/` |
| Form objects (criar `CardPurchase` + gerar parcelas) | `app/forms/card_purchase_form.rb` | `app/Http/Requests/` (parecido) |
| Concerns (mixins reutilizáveis) | `app/models/concerns/` | Traits PHP |

**Por que service object e não callback no model:** callback `after_create :generate_installments!` em `CardPurchase` funciona, mas esconde a lógica de "criar compra implica criar N parcelas". Um form/service deixa explícito e testável separadamente. Equivale a tirar lógica de `Eloquent observer` e colocar em `app/Services/`.

## Decisões adiadas (YAGNI)

- **Categorias de despesa** (mercado, lazer, etc.) — não no MVP
- **Múltiplas fontes de renda** — usuário tem 1 salário só, atributos no `User` resolvem
- **Compartilhamento de cartões entre usuários** — schema já permite (UserCard N:N), mas UI é monousuário
- **Recorrência de parcelas além das 12 padrão** — não é problema, `installments_count` é só integer

## Próximos passos

1. Implementar as 6 migrations
2. Criar models com associations, validations, concern `Closable`
3. Criar `Cycles::CloseService`
4. Criar form `CardPurchaseForm` que gera parcelas
5. (UI fica pra próximo plano)
