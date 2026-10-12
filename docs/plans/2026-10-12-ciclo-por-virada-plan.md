# Ciclo por virada — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O ciclo deixa de ser um mês do calendário e passa a ser o período entre duas viradas.
Junto vêm:
- tela de virada com checklist;
- quitar e cancelar parcelas restantes;
- compra de outra pessoa com controle de devolução;
- página de ciclos (histórico e prévia);
- conversão dos dados existentes.

**Architecture:**
- **Ciclos.** Cada usuário tem ciclos numerados (`cycles.number`), sempre um aberto.
- **Parcelas e contas fixas.** Guardam o número do ciclo em que caem (`cycle_number`); a virada só grava `cycle_id` nelas.
- **Regras de negócio.** Ficam em serviços (`app/services`), expostas pela API JSON em `/api/*`.
- **Telas.** São Stimulus fazendo `fetch` nessa API, como o resto do app.

**Tech Stack:** Rails 8.1, Ruby 3.3.6, Postgres 16, Hotwire (Stimulus via importmap, sem Node), Minitest, Docker Compose.

**Spec:** `docs/plans/2026-10-12-ciclo-por-virada-design.md`

## Global Constraints

- **Comandos.** Todo comando roda no container via `docker compose run --rm ... app <comando>`. O serviço `app` fica **parado** do Task 0 até o Task 20.
- **Testes sempre com `-e RAILS_ENV=test`.** O `.env` define `RAILS_ENV=development`, e sem a flag os testes rodam no banco com dados reais. Comando: `docker compose run --rm -e RAILS_ENV=test app bin/rails test <caminho>`.
- **Migrations só no banco de ensaio** até o Task 20. Comando: `docker compose run --rm -e POSTGRES_DB=finansheet_ensaio app bin/rails db:migrate`; ele também regenera `db/schema.rb`.
- **Não rodar `docker compose up app` antes do Task 20.** O boot roda `db:prepare` e migraria o banco real.
- **Para ver telas** durante o desenvolvimento, usar o servidor apontando para o ensaio: `docker compose run --rm --service-ports -e POSTGRES_DB=finansheet_ensaio app bin/rails server -b 0.0.0.0 -p 3001`.
- **Textos** de interface e mensagens de erro da API em português. Erros no padrão `{ errors: [...] }`.
- **Ciclo fechado é imutável** (concern `Closable`). Únicas exceções: `card_purchases.third_party_name` e `installments.reimbursed_at`.
- **Lint:** `docker compose run --rm app bin/rubocop` (rubocop-rails-omakase) sem ofensas novas.
- **Commits** em inglês, curtos, no padrão do repo, terminando com:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01YUhCcpWByvcjJNQPzrnvro
  ```
- **Backup** em `~/docker-backup-finansheet-2026-10-12/` (variável `B` nos comandos).

## Review Focus

- **Virada com conta fixa cujo pagamento ainda não foi gerado** (o usuário nunca abriu a lista no ciclo): o retrato tem que incluir a conta mesmo assim. Teste no Task 6.
- **Clique duplo / duas abas em "Virar ciclo"**: só uma virada acontece; a segunda requisição recebe 409. Testes no Task 6 (serviço e controller).
- **Conta nova, sem ciclo nenhum, abrindo o dashboard**: ganha o ciclo 1 sem erro. Testes nos Tasks 3 e 5.
- **Cancelar o restante apontando para parcela de ciclo fechado, ou para "a compra toda"**: recusa clara, compra intacta. Teste no Task 9.
- **Desfazer a virada depois de mexer no ciclo novo** (compra lançada, conta paga, cartão conferido): recusa com o motivo, nada muda. Teste no Task 7.

## Mapa de arquivos

**Criar**
- `db/migrate/20261012000001_add_cycle_numbering.rb`: colunas e tabela novas.
- `db/migrate/20261012000002_convert_months_to_cycle_numbers.rb`: conversão dos dados.
- `db/migrate/20261012000003_finalize_cycle_numbering.rb`: NOT NULL, índices, remoção do que é velho.
- `app/models/cycle_card_check.rb`
- `app/controllers/concerns/cycle_param.rb`: lê `?cycle=N`.
- `app/services/purchases/installment_builder.rb`
- `app/services/purchases/actions.rb`
- `app/services/purchases/prepay_service.rb`
- `app/services/purchases/undo_prepay_service.rb`
- `app/services/purchases/cancel_remaining_service.rb`
- `app/services/fixed_expenses/ensure_payments_for_cycle.rb`
- `app/services/cycles/totals.rb`
- `app/services/cycles/turn_service.rb`
- `app/services/cycles/undo_turn_service.rb`
- `app/services/cycles/projection.rb`
- `app/services/debts/query.rb`
- `app/services/debts/reimburse_service.rb`
- `app/controllers/cycle_card_checks_controller.rb`
- `app/controllers/debts_controller.rb`
- `app/javascript/controllers/purchase_menu_controller.js`
- `app/javascript/controllers/debts_controller.js`
- `app/javascript/controllers/turn_controller.js`
- `app/javascript/controllers/cycles_page_controller.js`
- `app/views/shared/_purchase_menu.html.erb`
- `app/views/home/turn.html.erb`
- `app/views/home/cycles.html.erb`
- `app/assets/stylesheets/cycles.css`
- `app/assets/images/logo-on-dark.svg`
- Testes novos ao lado de cada serviço/controller.

**Modificar**
- Models: `cycle.rb`, `user.rb`, `installment.rb`, `card_purchase.rb`, `fixed_expense.rb`, `fixed_expense_payment.rb`.
- Form: `app/forms/card_purchase_form.rb`.
- Serviço: `app/services/purchases/update_service.rb`.
- Controllers: `cards_controller.rb`, `card_installments_controller.rb`, `card_purchases_controller.rb`, `cycles_controller.rb` (reescrito), `fixed_expenses_controller.rb`, `fixed_expense_payments_controller.rb`, `home_controller.rb`.
- Rotas: `config/routes.rb`.
- JS: `cards_controller.js` (reescrito), `cycle_summary_controller.js`, `income_controller.js`, `fixed_expenses_summary_controller.js`, `fixed_expenses_modal_controller.js`, `tour_controller.js`, `login_form_controller.js`.
- Views: `home/index.html.erb`, `shared/_sidebar.html.erb`, `shared/_fixed_expenses_modal.html.erb`, `shared/_income_modal.html.erb`, `logins/new.html.erb`.
- CSS: `application.css` (import do `cycles.css`).
- e2e: `e2e/tests/smoke.spec.ts`.

**Remover**
- `app/services/cycles/close_service.rb` e o teste.
- `app/services/fixed_expenses/ensure_payments_for_month.rb`
- `app/controllers/incomes_controller.rb` e o teste.
- `app/models/income.rb`

---

### Task 0: Preparação (backup, ensaio, linha de base dos testes)

**Files:** nenhum arquivo do repo.

- [ ] **Step 1: Parar o app (o banco continua de pé)**

```bash
cd /home/hugo/Projects/finansheet
docker compose stop app
docker compose ps
```
Expected: `finansheet-app-1` como `exited`; `finansheet-banco-uso-hugo-1` como `running (healthy)`.

- [ ] **Step 2: Backup lógico e do volume**

```bash
B=~/docker-backup-finansheet-2026-10-12
mkdir -p "$B"
docker exec finansheet-banco-uso-hugo-1 sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$B/finansheet_development.dump"
docker compose stop banco-uso-hugo
docker run --rm -v finansheet_postgres_data_hugo:/data:ro -v "$B":/backup alpine tar czf /backup/postgres_data_hugo.tgz -C /data .
docker compose up -d banco-uso-hugo
until [ "$(docker inspect -f '{{.State.Health.Status}}' finansheet-banco-uso-hugo-1)" = healthy ]; do sleep 2; done
ls -la "$B"
```
Expected: `finansheet_development.dump` e `postgres_data_hugo.tgz` com tamanho maior que zero.

- [ ] **Step 3: Criar o banco de ensaio a partir do dump**

```bash
docker exec finansheet-banco-uso-hugo-1 sh -c 'createdb -U "$POSTGRES_USER" finansheet_ensaio'
docker exec -i finansheet-banco-uso-hugo-1 sh -c 'pg_restore -U "$POSTGRES_USER" -d finansheet_ensaio --no-owner' < "$B/finansheet_development.dump"
docker exec finansheet-banco-uso-hugo-1 sh -c 'psql -U "$POSTGRES_USER" -d finansheet_ensaio -Atc "select count(*) from card_purchases"'
```
Expected: o mesmo número de compras do banco real. `-i` é obrigatório no `pg_restore` por stdin; sem ele o comando sai em silêncio.

- [ ] **Step 4: Fotografar o "antes" para conferir a conversão**

```bash
docker exec -i finansheet-banco-uso-hugo-1 sh -c 'psql -U "$POSTGRES_USER" -d finansheet_ensaio -At' > "$B/antes.txt" <<'SQL'
SELECT 'ciclo', u.email, c.reference_month, c.total_expenses
  FROM cycles c JOIN users u ON u.id = c.user_id ORDER BY 2, 3;
SELECT 'cartao', u.email, ca.name, i.due_month, sum(i.amount)
  FROM installments i
  JOIN card_purchases p ON p.id = i.card_purchase_id
  JOIN cards ca ON ca.id = p.card_id
  JOIN users u ON u.id = p.user_id
 WHERE i.cycle_id IS NULL
 GROUP BY 2, 3, 4 ORDER BY 2, 3, 4;
SELECT 'renda', u.email, r.reference_month, r.amount
  FROM incomes r JOIN users u ON u.id = r.user_id ORDER BY 2, 3;
SQL
cat "$B/antes.txt"
```
Expected: linhas `ciclo|...` (4 do usuário dev), `cartao|...` por cartão e mês, `renda|...`.

- [ ] **Step 5: Banco de teste e linha de base da suíte**

```bash
docker compose run --rm -e RAILS_ENV=test app bin/rails db:prepare
docker compose run --rm -e RAILS_ENV=test app bin/rails test 2>&1 | tail -30
```
Expected: o resumo `N runs, N assertions, F failures, E errors`. **Anotar quais testes já falham hoje** (por exemplo, os do `card_purchase_form_test` que ainda falam de `best_day`). Eles serão reescritos nos tasks seguintes; não corrigir aqui.

Sem commit neste task.

---

### Task 1: Migration de estrutura (colunas e tabela novas)

**Files:**
- Create: `db/migrate/20261012000001_add_cycle_numbering.rb`
- Modify: `db/schema.rb` (gerado)

**Interfaces:**
- Produces:
  - `cycles`: `number`, `started_at`, `expected_income`, `total_own_cards`, `total_third_party`, `total_fixed_expenses`.
  - `installments`: `cycle_number`, `original_cycle_number`, `reimbursed_at`.
  - `card_purchases`: `third_party_name`, `cancelled_at`.
  - `fixed_expenses.start_cycle_number`; `fixed_expense_payments.cycle_number`.
  - Tabela `cycle_card_checks`.
  - Colunas antigas viram anuláveis: `cycles.reference_month`, `installments.due_month`, `fixed_expense_payments.reference_month`.
  - A check `fixed_expenses_installments_consistency` (que citava `start_month`) é removida; a nova entra no Task 12.

- [ ] **Step 1: Escrever a migration**

```ruby
# db/migrate/20261012000001_add_cycle_numbering.rb
#
# Ciclo deixa de ser mês do calendário e vira período numerado entre viradas.
# Esta migration só ADICIONA estrutura (tudo anulável). A conversão dos dados
# vem na 20261012000002 e o aperto (NOT NULL, índices, remoção do velho) na
# 20261012000003.
class AddCycleNumbering < ActiveRecord::Migration[8.1]
  OLD_FIXED_EXPENSES_CHECK =
    "installments_count IS NULL AND start_month IS NULL OR " \
    "installments_count IS NOT NULL AND start_month IS NOT NULL AND " \
    "installments_paid >= 0 AND installments_paid < installments_count"

  def change
    change_table :cycles, bulk: true do |t|
      t.integer  :number
      t.datetime :started_at
      t.decimal  :expected_income,      precision: 12, scale: 2, default: "0.0", null: false
      t.decimal  :total_own_cards,      precision: 12, scale: 2, default: "0.0", null: false
      t.decimal  :total_third_party,    precision: 12, scale: 2, default: "0.0", null: false
      t.decimal  :total_fixed_expenses, precision: 12, scale: 2, default: "0.0", null: false
    end
    change_column_null :cycles, :reference_month, true

    change_table :installments, bulk: true do |t|
      t.integer  :cycle_number
      t.integer  :original_cycle_number
      t.datetime :reimbursed_at
    end
    change_column_null :installments, :due_month, true

    change_table :card_purchases, bulk: true do |t|
      t.text     :third_party_name
      t.datetime :cancelled_at
    end

    add_column :fixed_expenses, :start_cycle_number, :integer
    remove_check_constraint :fixed_expenses, OLD_FIXED_EXPENSES_CHECK,
                            name: "fixed_expenses_installments_consistency"

    add_column :fixed_expense_payments, :cycle_number, :integer
    change_column_null :fixed_expense_payments, :reference_month, true

    create_table :cycle_card_checks, id: :uuid do |t|
      t.references :cycle, type: :uuid, null: false, foreign_key: true
      t.references :card,  type: :uuid, null: false, foreign_key: true
      t.datetime :checked_at, null: false
      t.timestamps
    end
    add_index :cycle_card_checks, [:cycle_id, :card_id], unique: true
  end
end
```

- [ ] **Step 2: Rodar no ensaio**

Run: `docker compose run --rm -e POSTGRES_DB=finansheet_ensaio app bin/rails db:migrate`
Expected: `== 20261012000001 AddCycleNumbering: migrated`. `git diff db/schema.rb` mostra as colunas novas e `create_table "cycle_card_checks"`.

- [ ] **Step 3: Conferir que volta e vai**

```bash
docker compose run --rm -e POSTGRES_DB=finansheet_ensaio app bin/rails db:rollback
docker compose run --rm -e POSTGRES_DB=finansheet_ensaio app bin/rails db:migrate
```
Expected: `reverted` e depois `migrated`, sem erro.

- [ ] **Step 4: A suíte continua igual à linha de base**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test 2>&1 | tail -5`
Expected: mesmas falhas anotadas no Task 0, nenhuma nova.

- [ ] **Step 5: Commit**

```bash
git add db/migrate/20261012000001_add_cycle_numbering.rb db/schema.rb
git commit -m "Add cycle numbering columns and cycle_card_checks table"
```

---

### Task 2: Migration de conversão dos dados (e ensaio na cópia)

**Files:**
- Create: `db/migrate/20261012000002_convert_months_to_cycle_numbers.rb`

**Interfaces:**
- Consumes: colunas do Task 1.
- Produces: todo usuário com exatamente um ciclo aberto, e todas as linhas com número de ciclo:
  - ciclos fechados recebem `number`, `started_at` e o retrato (`total_income`, `total_own_cards`, `total_third_party`, `total_fixed_expenses`);
  - todas as parcelas e pagamentos ficam com `cycle_number`;
  - contas fixas parceladas ficam com `start_cycle_number`;
  - compras "olho riscado" viram `third_party_name = "Outra pessoa"`, e as parcelas delas em ciclo fechado ficam com `reimbursed_at`.

- [ ] **Step 1: Escrever a migration**

```ruby
# db/migrate/20261012000002_convert_months_to_cycle_numbers.rb
#
# Converte o modelo "ciclo = mês" para "ciclo = número". Regras (spec,
# seção "Conversão dos dados existentes"):
#   - ciclos fechados, em ordem de mês, viram 1..k;
#   - o ciclo aberto vira k+1 e corresponde ao 1º mês sem ciclo fechado a
#     partir do mês atual;
#   - parcela/pagamento aberto cai em k+1 + meses depois do mês aberto.
# Falha (e desfaz tudo) se o total de algum ciclo fechado não bater.
class ConvertMonthsToCycleNumbers < ActiveRecord::Migration[8.1]
  class ConversionMismatch < StandardError; end

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

  # Mesma regra do antigo User#next_open_cycle_month.
  def first_open_month(closed_months)
    candidate = Date.current.beginning_of_month
    candidate = candidate >> 1 while closed_months.include?(candidate)
    candidate
  end

  def months_between(from, to)
    (to.year * 12 + to.month) - (from.year * 12 + from.month)
  end
end
```

- [ ] **Step 2: Rodar no ensaio**

Run: `docker compose run --rm -e POSTGRES_DB=finansheet_ensaio app bin/rails db:migrate`
Expected: `migrated` e linhas `-- usuário ...: 4 ciclo(s) fechado(s), ciclo aberto nº 5 (2026-10-01)` para o dev e `0 ciclo(s) ..., nº 1` para a outra conta. Nenhum `ConversionMismatch`.

- [ ] **Step 3: Fotografar o "depois" e comparar com o "antes"**

```bash
B=~/docker-backup-finansheet-2026-10-12
docker exec -i finansheet-banco-uso-hugo-1 sh -c 'psql -U "$POSTGRES_USER" -d finansheet_ensaio -At' > "$B/depois.txt" <<'SQL'
SELECT 'ciclo', u.email, c.number, c.reference_month, c.closed_at IS NOT NULL,
       c.total_own_cards + c.total_third_party + c.total_fixed_expenses, c.total_expenses,
       c.total_income, c.expected_income
  FROM cycles c JOIN users u ON u.id = c.user_id ORDER BY 2, 3;
SELECT 'cartao', u.email, ca.name, i.cycle_number, sum(i.amount)
  FROM installments i
  JOIN card_purchases p ON p.id = i.card_purchase_id
  JOIN cards ca ON ca.id = p.card_id
  JOIN users u ON u.id = p.user_id
 WHERE i.cycle_id IS NULL
 GROUP BY 2, 3, 4 ORDER BY 2, 3, 4;
SELECT 'terceiro', u.email, p.description, p.third_party_name, count(i.reimbursed_at)
  FROM card_purchases p JOIN users u ON u.id = p.user_id
  JOIN installments i ON i.card_purchase_id = p.id
 WHERE p.third_party_name IS NOT NULL GROUP BY 2, 3, 4;
SQL
cat "$B/depois.txt"
```
Expected:
- Em cada `ciclo` fechado, a 6ª coluna (soma do retrato) é igual à 7ª (`total_expenses` antigo), e `total_income` é igual à `renda` do mesmo mês no `antes.txt`.
- O ciclo aberto tem `expected_income` igual à renda de outubro.
- Cada linha `cartao` do `antes.txt` aparece no `depois.txt` com a mesma soma, trocando o mês pelo número do ciclo:
  - dev: 2026-10 vira 5, 2026-11 vira 6, e assim por diante;
  - outra conta: 2026-10 vira 1.
- "Fogão - Mãe" aparece como `Outra pessoa`, com `reimbursed_at` nas parcelas de ciclos fechados.

- [ ] **Step 4: Conferir que volta e vai**

```bash
docker compose run --rm -e POSTGRES_DB=finansheet_ensaio app bin/rails db:rollback
docker compose run --rm -e POSTGRES_DB=finansheet_ensaio app bin/rails db:migrate
```
Expected: `reverted`, depois `migrated` com as mesmas mensagens do Step 2.

- [ ] **Step 5: Suíte igual à linha de base e commit**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test 2>&1 | tail -5`
Expected: mesmas falhas do Task 0.

```bash
git add db/migrate/20261012000002_convert_months_to_cycle_numbers.rb db/schema.rb
git commit -m "Convert month-based cycles to numbered cycles"
```

---

### Task 3: Modelo de ciclo, ciclo aberto do usuário e conferência de cartão

**Files:**
- Modify: `app/models/cycle.rb`, `app/models/user.rb`, `app/models/card_purchase.rb`
- Create: `app/models/cycle_card_check.rb`, `test/models/cycle_test.rb`, `test/models/card_purchase_test.rb`
- Delete: `app/services/cycles/close_service.rb`, `test/services/cycles/close_service_test.rb`, `app/controllers/cycles_controller.rb` (recriado no Task 6)
- Modify: `config/routes.rb` (sai `post "cycles/close"`), `test/controllers/card_purchases_controller_test.rb`, `test/services/purchases/update_service_test.rb`, `test/services/purchases/destroy_service_test.rb` (criação de ciclos fechados)

**Interfaces:**
- Produces:
  - `Cycle.open`, `Cycle.closed` (scopes), `Cycle#closed?`, `Cycle#card_checks`.
  - `User#open_cycle -> Cycle`: cria o próximo número quando não há ciclo aberto; conta nova recebe o 1.
  - `CardPurchase#third_party?`, com `third_party_name` normalizado (squish; vazio vira nil).
  - `CycleCardCheck(cycle:, card:, checked_at:)`.

- [ ] **Step 1: Escrever os testes**

```ruby
# test/models/cycle_test.rb
require "test_helper"

class CycleTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(email: "cycle@finansheet.local", password: "secret123")
  end

  test "open_cycle creates cycle 1 for a new account" do
    cycle = @user.open_cycle

    assert_equal 1, cycle.number
    assert_not cycle.closed?
    assert_in_delta Time.current, cycle.started_at, 5
  end

  test "open_cycle returns the existing open cycle" do
    first = @user.open_cycle

    assert_equal first, @user.open_cycle
    assert_equal 1, @user.cycles.count
  end

  test "open_cycle continues numbering after closed cycles" do
    @user.cycles.create!(number: 3, started_at: 2.months.ago, closed_at: 1.month.ago)

    assert_equal 4, @user.open_cycle.number
  end

  test "closed cycle is immutable" do
    cycle = @user.cycles.create!(number: 1, started_at: 2.months.ago, closed_at: 1.month.ago)

    assert_not cycle.update(expected_income: 10)
    assert_includes cycle.errors[:base], "registro fechado e imutável"
  end

  test "number is unique per user" do
    @user.cycles.create!(number: 1, started_at: Time.current)
    duplicate = @user.cycles.build(number: 1, started_at: Time.current, closed_at: Time.current)

    assert_not duplicate.valid?
  end
end
```

```ruby
# test/models/card_purchase_test.rb
require "test_helper"

class CardPurchaseTest < ActiveSupport::TestCase
  test "third_party_name is squished and blank becomes nil" do
    assert_equal "Mãe da Silva", CardPurchase.new(third_party_name: "  Mãe  da  Silva ").third_party_name
    assert_nil CardPurchase.new(third_party_name: "   ").third_party_name
  end

  test "third_party? reflects the name" do
    assert CardPurchase.new(third_party_name: "Mãe").third_party?
    assert_not CardPurchase.new.third_party?
  end
end
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test test/models/cycle_test.rb test/models/card_purchase_test.rb`
Expected: FAIL com `NoMethodError: undefined method 'open_cycle'` e `third_party?`.

- [ ] **Step 3: Implementar**

```ruby
# app/models/cycle.rb
class Cycle < ApplicationRecord
  include Closable

  belongs_to :user

  has_many :installments,           dependent: :restrict_with_exception
  has_many :fixed_expense_payments, dependent: :restrict_with_exception
  has_many :card_checks, class_name: "CycleCardCheck", dependent: :delete_all

  # Período entre duas viradas. Aberto = closed_at nulo; sempre existe um
  # por usuário (User#open_cycle).
  scope :open,   -> { where(closed_at: nil) }
  scope :closed, -> { where.not(closed_at: nil) }

  validates :number,          numericality: { greater_than: 0, only_integer: true },
                              uniqueness: { scope: :user_id }
  validates :started_at,      presence: true
  validates :expected_income, numericality: { greater_than_or_equal_to: 0 }

  def closed?
    closed_at.present?
  end

  def was_closed?
    closed_at_was.present?
  end
end
```

```ruby
# app/models/cycle_card_check.rb
# "Conferido ✓" de um cartão num ciclo: o usuário bateu o total do app com
# o app do banco.
class CycleCardCheck < ApplicationRecord
  belongs_to :cycle
  belongs_to :card

  validates :checked_at, presence: true
  validates :card_id,    uniqueness: { scope: :cycle_id }
end
```

Em `app/models/user.rb`, logo abaixo de `salary_configured?`:

```ruby
  # Ciclo aberto do usuário. Conta nova (sem ciclo) ganha o ciclo seguinte
  # ao último número usado — o 1 na primeira vez.
  def open_cycle
    cycles.open.first || cycles.create!(number: (cycles.maximum(:number) || 0) + 1, started_at: Time.current)
  rescue ActiveRecord::RecordNotUnique
    cycles.open.first!
  end
```

Em `app/models/card_purchase.rb`, depois dos `validates`:

```ruby
  normalizes :third_party_name, with: ->(name) { name.squish.presence }

  # Compra feita por outra pessoa no cartão do usuário: soma na fatura,
  # mas não no saldo dele.
  def third_party?
    third_party_name.present?
  end
```

- [ ] **Step 4: Remover o fechamento antigo e ajustar os testes que criam ciclo fechado**

```bash
git rm app/services/cycles/close_service.rb test/services/cycles/close_service_test.rb app/controllers/cycles_controller.rb
```

Em `config/routes.rb`, apagar a linha `post "cycles/close" => "cycles#close"`.

Em `test/controllers/card_purchases_controller_test.rb`, `test/services/purchases/update_service_test.rb` e `test/services/purchases/destroy_service_test.rb`, trocar toda ocorrência de

```ruby
cycle = @user.cycles.create!(reference_month: Date.new(2026, 4, 1), closed_at: Time.current)
```
por
```ruby
cycle = @user.cycles.create!(number: 99, started_at: 1.month.ago, closed_at: Time.current)
```
No `update_service_test.rb`, o teste `"advances to next open cycle when original due_month is in a closed cycle (orphan)"` também cria ciclo; ele é reescrito no Task 5, então aqui só troque o `create!` como acima.

- [ ] **Step 5: Rodar e ver passar**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test test/models`
Expected: PASS.

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test 2>&1 | tail -5`
Expected: as falhas da linha de base, mais as de testes que ainda criam ciclo "por mês" e são reescritos ou removidos adiante:
- o teste "orphan" do `update_service_test` (Task 5);
- `incomes_controller_test` (Task 6);
- os testes `next_open_cycle_month` do `user_test` (Task 12).

Nenhuma outra falha nova.

- [ ] **Step 6: Commit**

```bash
git add -A app/models test/models config/routes.rb test/controllers test/services
git commit -m "Add numbered Cycle model, User#open_cycle and card checks"
```

---

### Task 4: Contas fixas por ciclo

**Files:**
- Create: `app/controllers/concerns/cycle_param.rb`, `app/services/fixed_expenses/ensure_payments_for_cycle.rb`, `test/services/fixed_expenses/ensure_payments_for_cycle_test.rb`, `test/controllers/fixed_expenses_controller_test.rb`
- Modify: `app/models/fixed_expense.rb`, `app/models/fixed_expense_payment.rb`, `app/controllers/fixed_expenses_controller.rb`, `app/controllers/fixed_expense_payments_controller.rb`
- Delete: `app/services/fixed_expenses/ensure_payments_for_month.rb`

**Interfaces:**
- Consumes: `User#open_cycle`, `Cycle.closed` (Task 3).
- Produces:
  - `CycleParam#cycle_number_param -> Integer` e `CycleParam::MAX_AHEAD = 6`.
  - `FixedExpenses::EnsurePaymentsForCycle.new(user:, cycle_number:).call`.
  - `FixedExpenses::EnsurePaymentsForCycle.installment_number_for(expense, cycle_number) -> Integer | nil`.
  - `FixedExpenses::EnsurePaymentsForCycle.applies?(expense, cycle_number) -> Boolean`.
  - `GET /api/fixed_expenses?cycle=N -> { cycle, editable, total, paid_total, pending_total, items: [...] }`.
  - `PATCH /api/fixed_expense_payments/:id` só no ciclo aberto, e aceita `amount: 0`.

- [ ] **Step 1: Escrever os testes**

```ruby
# test/services/fixed_expenses/ensure_payments_for_cycle_test.rb
require "test_helper"

class FixedExpenses::EnsurePaymentsForCycleTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(email: "fe@finansheet.local", password: "secret123")
    @open = @user.open_cycle
  end

  def ensure_for(number)
    FixedExpenses::EnsurePaymentsForCycle.new(user: @user, cycle_number: number).call
  end

  test "creates one payment per active recurring expense and is idempotent" do
    fe = @user.fixed_expenses.create!(name: "Aluguel", amount: 750)

    2.times { ensure_for(@open.number) }

    assert_equal [750.to_d], fe.payments.where(cycle_number: @open.number).pluck(:amount)
  end

  test "skips inactive expenses" do
    @user.fixed_expenses.create!(name: "Velha", amount: 10, active: false)

    ensure_for(@open.number)

    assert_equal 0, FixedExpensePayment.count
  end

  test "parceled expense advances one cycle at a time" do
    fe = @user.fixed_expenses.create!(name: "TV", amount: 200, installments_count: 7,
                                      installments_paid: 3, start_cycle_number: @open.number)

    assert_equal 4, FixedExpenses::EnsurePaymentsForCycle.installment_number_for(fe, @open.number)
    assert_equal 7, FixedExpenses::EnsurePaymentsForCycle.installment_number_for(fe, @open.number + 3)
    assert_nil FixedExpenses::EnsurePaymentsForCycle.installment_number_for(fe, @open.number + 4)

    ensure_for(@open.number + 4)
    assert_equal 0, fe.payments.count
  end

  test "does not create payments in a closed cycle" do
    @open.update!(closed_at: Time.current)
    @user.fixed_expenses.create!(name: "Aluguel", amount: 750)

    ensure_for(@open.number)

    assert_equal 0, FixedExpensePayment.count
  end
end
```

```ruby
# test/controllers/fixed_expenses_controller_test.rb
require "test_helper"

class FixedExpensesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = User.create!(email: "fec@finansheet.local", password: "secret123")
    @auth = { "Authorization" => "Bearer #{AuthToken.encode(user_id: @user.id)}" }
    @open = @user.open_cycle
  end

  test "GET index lists payments of the open cycle" do
    @user.fixed_expenses.create!(name: "Internet", amount: 90)

    get "/api/fixed_expenses", headers: @auth, as: :json

    assert_response :ok
    body = JSON.parse(response.body)
    assert_equal @open.number, body["cycle"]
    assert body["editable"]
    assert_equal ["Internet"], body["items"].map { |i| i["name"] }
  end

  test "POST parceled expense starts in the open cycle" do
    post "/api/fixed_expenses",
         params: { fixed_expense: { name: "TV", amount: 200, installments_count: 7, installments_paid: 3 } },
         headers: @auth, as: :json

    assert_response :created
    fe = @user.fixed_expenses.last
    assert_equal @open.number, fe.start_cycle_number
    assert_equal 1, fe.payments.where(cycle_number: @open.number).count
  end

  test "PATCH payment outside the open cycle is refused" do
    fe = @user.fixed_expenses.create!(name: "Internet", amount: 90)
    future = fe.payments.create!(amount: 90, cycle_number: @open.number + 1)

    patch "/api/fixed_expense_payments/#{future.id}", params: { paid: true }, headers: @auth, as: :json

    assert_response :unprocessable_entity
    assert_nil future.reload.paid_at
  end

  test "PATCH payment accepts zero amount in the open cycle" do
    fe = @user.fixed_expenses.create!(name: "Faxineira", amount: 150)
    payment = fe.payments.create!(amount: 150, cycle_number: @open.number)

    patch "/api/fixed_expense_payments/#{payment.id}", params: { amount: 0 }, headers: @auth, as: :json

    assert_response :ok
    assert_equal 0.to_d, payment.reload.amount
  end
end
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test test/services/fixed_expenses test/controllers/fixed_expenses_controller_test.rb`
Expected: FAIL com `uninitialized constant FixedExpenses::EnsurePaymentsForCycle` e erros de validação de `start_cycle_number`.

- [ ] **Step 3: Implementar modelos, concern e serviço**

```ruby
# app/controllers/concerns/cycle_param.rb
# Lê ?cycle=N. Ausente ou fora do intervalo navegável (do ciclo 1 até 6
# ciclos à frente do aberto), usa o ciclo aberto.
module CycleParam
  extend ActiveSupport::Concern

  MAX_AHEAD = 6

  private

  def cycle_number_param
    open_number = current_user.open_cycle.number
    number = Integer(params[:cycle].to_s, exception: false)
    number&.between?(1, open_number + MAX_AHEAD) ? number : open_number
  end
end
```

```ruby
# app/services/fixed_expenses/ensure_payments_for_cycle.rb
module FixedExpenses
  # Idempotente: garante que cada FixedExpense ativa do user tenha um
  # FixedExpensePayment no ciclo. Não toca payments existentes (preserva
  # edições pontuais, como zerar uma conta que não aconteceu).
  #
  # Ciclo fechado não ganha payments novos. Parcelada só gera payment
  # enquanto a parcela calculada cai em [1..installments_count].
  class EnsurePaymentsForCycle
    def initialize(user:, cycle_number:)
      @user = user
      @cycle_number = cycle_number
    end

    def call
      return if @user.cycles.closed.exists?(number: @cycle_number)

      @user.fixed_expenses.active.find_each do |expense|
        next unless self.class.applies?(expense, @cycle_number)

        FixedExpensePayment.find_or_create_by(fixed_expense_id: expense.id, cycle_number: @cycle_number) do |payment|
          payment.amount = expense.amount
        end
      end
    end

    # Número da parcela no ciclo (nil pra recorrentes e fora do range).
    def self.installment_number_for(expense, cycle_number)
      return nil unless expense.parceled?

      offset = cycle_number - expense.start_cycle_number
      return nil if offset.negative?

      number = expense.installments_paid.to_i + offset + 1
      number > expense.installments_count.to_i ? nil : number
    end

    def self.applies?(expense, cycle_number)
      !expense.parceled? || installment_number_for(expense, cycle_number).present?
    end
  end
end
```

Em `app/models/fixed_expense.rb`, substituir o método `installments_consistency` inteiro por:

```ruby
  # Espelha a check constraint do banco com mensagens amigáveis.
  def installments_consistency
    if installments_count.blank? && start_cycle_number.blank?
      errors.add(:installments_paid, "deve ser 0 em conta recorrente") if installments_paid.to_i.positive?
      return
    end

    if installments_count.blank? || start_cycle_number.blank?
      errors.add(:base, "informe total de parcelas e ciclo da próxima parcela, ou deixe ambos vazios")
      return
    end

    unless installments_count.to_i.positive?
      errors.add(:installments_count, "deve ser maior que zero")
    end

    paid = installments_paid.to_i
    if paid < 0 || paid >= installments_count.to_i
      errors.add(:installments_paid, "deve estar entre 0 e #{installments_count.to_i - 1}")
    end
  end
```
e trocar o comentário de `parceled?` para: `# Parcelada = tem fim definido (ex: sofá em 10×). Recorrente = installments_count nil.` (sem mudança de código).

Em `app/models/fixed_expense_payment.rb`, trocar as validações por:

```ruby
  validates :amount,       numericality: { greater_than_or_equal_to: 0 }
  validates :cycle_number, presence: true,
                           uniqueness: { scope: :fixed_expense_id }
```

```bash
git rm app/services/fixed_expenses/ensure_payments_for_month.rb
```

- [ ] **Step 4: Reescrever os controllers de contas fixas**

```ruby
# app/controllers/fixed_expenses_controller.rb
class FixedExpensesController < ApiController
  include CycleParam

  before_action :load_fixed_expense, only: [:update, :destroy]

  # GET /api/fixed_expenses?cycle=N
  # Uma linha por pagamento do ciclo. Ciclos ainda não fechados ganham os
  # pagamentos que faltam (EnsurePaymentsForCycle é idempotente). Fechados
  # mostram o que ficou gravado, inclusive de contas já removidas.
  def index
    number = cycle_number_param
    FixedExpenses::EnsurePaymentsForCycle.new(user: current_user, cycle_number: number).call

    payments   = cycle_payments(number)
    total      = payments.sum(&:amount).to_f
    paid_total = payments.select(&:paid_at).sum(&:amount).to_f

    render json: {
      cycle:         number,
      editable:      number == current_user.open_cycle.number,
      total:         total,
      paid_total:    paid_total,
      pending_total: (total - paid_total).round(2),
      items:         payments.map { |p| serialize_payment(p, number) },
    }
  end

  # POST /api/fixed_expenses { fixed_expense: {...} }
  # Parcelada: a próxima parcela (installments_paid + 1) cai no ciclo aberto.
  def create
    open_number = current_user.open_cycle.number
    fe = current_user.fixed_expenses.new(create_params(open_number).merge(active: true))

    if fe.save
      FixedExpenses::EnsurePaymentsForCycle.new(user: current_user, cycle_number: open_number).call
      render json: { fixed_expense: serialize_expense(fe) }, status: :created
    else
      render json: { errors: fe.errors.full_messages }, status: :unprocessable_entity
    end
  end

  # PATCH /api/fixed_expenses/:id
  # Se `amount` mudou, propaga pros payments ainda não fechados — fechados
  # ficam intactos (reajuste vale daqui pra frente).
  def update
    new_amount = fixed_expense_params[:amount]

    if @fixed_expense.update(fixed_expense_params)
      if new_amount.present?
        @fixed_expense.payments.where(cycle_id: nil).update_all(amount: @fixed_expense.amount)
      end
      render json: { fixed_expense: serialize_expense(@fixed_expense) }
    else
      render json: { errors: @fixed_expense.errors.full_messages }, status: :unprocessable_entity
    end
  end

  # DELETE /api/fixed_expenses/:id
  # Soft delete: active=false preserva histórico. Remove os payments ainda
  # não fechados (ciclo aberto e futuros).
  def destroy
    ActiveRecord::Base.transaction do
      @fixed_expense.update!(active: false)
      @fixed_expense.payments.where(cycle_id: nil).destroy_all
    end
    render json: { success: true }
  end

  private

  def load_fixed_expense
    @fixed_expense = current_user.fixed_expenses.find_by(id: params[:id])
    return if @fixed_expense

    render json: { errors: ["conta fixa não encontrada"] }, status: :not_found
  end

  # Campos de parcelamento são imutáveis após criação — pra mudar, remover
  # e recriar.
  def fixed_expense_params
    params.require(:fixed_expense).permit(:name, :amount, :due_day)
  end

  def create_params(open_number)
    raw = params.require(:fixed_expense).permit(:name, :amount, :due_day, :installments_count, :installments_paid)

    parceled = raw[:installments_count].present?
    {
      name:               raw[:name],
      amount:             raw[:amount],
      due_day:            raw[:due_day],
      installments_count: parceled ? raw[:installments_count].to_i : nil,
      installments_paid:  parceled ? raw[:installments_paid].to_i  : 0,
      start_cycle_number: parceled ? open_number : nil,
    }
  end

  def cycle_payments(number)
    FixedExpensePayment
      .joins(:fixed_expense)
      .where(fixed_expenses: { user_id: current_user.id })
      .where(cycle_number: number)
      .includes(:fixed_expense)
      .order(Arel.sql("fixed_expenses.due_day ASC NULLS LAST, fixed_expenses.name ASC"))
  end

  def serialize_payment(payment, number)
    expense = payment.fixed_expense

    {
      payment_id:         payment.id,
      expense_id:         expense.id,
      name:               expense.name,
      due_day:            expense.due_day,
      amount:             payment.amount.to_f,
      paid_at:            payment.paid_at,
      cycle_closed:       payment.cycle_id.present?,
      installment_number: FixedExpenses::EnsurePaymentsForCycle.installment_number_for(expense, number),
      installments_count: expense.installments_count,
    }
  end

  def serialize_expense(fe)
    {
      id:                 fe.id,
      name:               fe.name,
      amount:             fe.amount.to_f,
      due_day:            fe.due_day,
      active:             fe.active,
      installments_count: fe.installments_count,
      installments_paid:  fe.installments_paid,
      start_cycle_number: fe.start_cycle_number,
    }
  end
end
```

Em `app/controllers/fixed_expense_payments_controller.rb`, trocar o bloco `if @payment.closed? ... end` do `update` por:

```ruby
    unless @payment.cycle_number == current_user.open_cycle.number
      render json: { errors: ["só dá para alterar contas do ciclo aberto"] },
             status: :unprocessable_entity
      return
    end
```
atualizar o comentário do método para `# Recusa fora do ciclo aberto — fechados são imutáveis e futuros ainda não chegaram.` e acrescentar `cycle_number: p.cycle_number,` no `serialize`.

- [ ] **Step 5: Rodar e ver passar**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test test/services/fixed_expenses test/controllers/fixed_expenses_controller_test.rb`
Expected: PASS (8 testes).

- [ ] **Step 6: Commit**

```bash
git add -A app/controllers/concerns/cycle_param.rb app/services/fixed_expenses app/models/fixed_expense.rb app/models/fixed_expense_payment.rb app/controllers/fixed_expenses_controller.rb app/controllers/fixed_expense_payments_controller.rb test/services/fixed_expenses test/controllers/fixed_expenses_controller_test.rb
git commit -m "Fixed expenses by cycle number"
```

---

### Task 5: Compras e parcelas por ciclo (lançar, editar, listar, "de outra pessoa")

**Files:**
- Create: `app/services/purchases/installment_builder.rb`, `app/services/purchases/actions.rb`, `test/services/purchases/actions_test.rb`, `test/controllers/card_installments_controller_test.rb`, `test/controllers/cards_controller_test.rb`
- Modify: `app/models/installment.rb`, `app/forms/card_purchase_form.rb`, `app/services/purchases/update_service.rb`, `app/controllers/card_purchases_controller.rb`, `app/controllers/card_installments_controller.rb`, `app/controllers/cards_controller.rb`, `config/routes.rb`
- Test (reescrever): `test/forms/card_purchase_form_test.rb`, `test/services/purchases/update_service_test.rb`
- Test (ajustar): `test/controllers/card_purchases_controller_test.rb`

**Interfaces:**
- Consumes: `User#open_cycle`, `CardPurchase#third_party_name`, `CycleParam` (Tasks 3 e 4).
- Produces:
  - `Purchases::InstallmentBuilder.new(card_purchase:, first_cycle_number:).build!`
  - `Purchases::Actions.for(purchases, open_number:) -> { purchase_id => Flags(editable, can_prepay, can_undo_prepay, cancel_from) }`
  - `CardPurchaseForm` aceita `third_party_name`; sai `next_due_month`.
  - `GET /api/cards?cycle=N -> { cycle: { number, status: "open"|"closed"|"upcoming", started_at, closed_at, expected_income, first_number, open_number, max_number }, cards: [{..., checked}] }`
  - `GET /api/cards/:card_id/installments?cycle=N -> { cycle, cycle_total, cycle_total_own, future_total, installments: [{ id, number, installments_count, amount, cycle_number, prepaid, description, purchase_id, purchase_total_amount, purchased_on, third_party_name, reimbursed, cancelled, editable, can_prepay, can_undo_prepay, cancel_from }] }`
  - `PATCH /api/cards/:card_id/purchases/:id/third_party { third_party_name }`, que substitui `toggle_excluded`.

- [ ] **Step 1: Reescrever os testes do form e do update service**

```ruby
# test/forms/card_purchase_form_test.rb
require "test_helper"

class CardPurchaseFormTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(email: "test@finansheet.local", password: "secret123")
    @card = @user.cards.create!(name: "Nubank", bank: "Nubank", mode: :credit)
    @open = @user.open_cycle
  end

  def build(**attrs)
    CardPurchaseForm.new(user: @user, card: @card, description: "Celular novo",
                         total_amount: 1440, installments_count: 8, **attrs)
  end

  test "first installment goes to the open cycle, one per cycle after that" do
    form = build(purchased_on: Date.new(2026, 1, 15))

    assert form.save, form.errors.full_messages.inspect
    purchase = form.card_purchase
    assert_equal Date.new(2026, 1, 15), purchase.purchased_on
    assert_equal (@open.number..@open.number + 7).to_a, purchase.installments.order(:number).pluck(:cycle_number)
    assert_equal [180] * 8, purchase.installments.order(:number).pluck(:amount).map(&:to_i)
  end

  test "puts division remainder on last installment" do
    form = build(total_amount: 100, installments_count: 3)

    assert form.save
    amounts = form.card_purchase.installments.order(:number).pluck(:amount)
    assert_equal [33.33.to_d, 33.33.to_d, 33.34.to_d], amounts
  end

  test "with paid installments the next one lands in the open cycle" do
    form = build(total_amount: 1000, installments_count: 10, installments_paid: 9)

    assert form.save
    installment = form.card_purchase.installments.sole
    assert_equal 10, installment.number
    assert_equal @open.number, installment.cycle_number
    assert_equal 100.to_d, installment.amount
  end

  test "card without closing day accepts purchases" do
    assert build.save
  end

  test "saves third party name" do
    form = build(third_party_name: " Mãe ")

    assert form.save
    assert_equal "Mãe", form.card_purchase.third_party_name
  end

  test "purchased_on defaults to today" do
    form = build

    assert form.save
    assert_equal Date.current, form.card_purchase.purchased_on
  end

  test "validates required fields" do
    form = CardPurchaseForm.new(user: @user, card: @card)

    assert_not form.save
    assert form.errors[:description].any?
    assert form.errors[:total_amount].any?
  end

  test "validates paid installments range" do
    form = build(installments_count: 3, installments_paid: 3)

    assert_not form.save
    assert form.errors[:installments_paid].any?
  end
end
```

```ruby
# test/services/purchases/update_service_test.rb
require "test_helper"

module Purchases
  class UpdateServiceTest < ActiveSupport::TestCase
    setup do
      @user     = User.create!(email: "upd@finansheet.local", password: "secret123")
      @card     = @user.cards.create!(name: "Nubank", mode: :credit)
      @open     = @user.open_cycle
      @purchase = create_purchase(total: 1200, count: 4)
    end

    test "rebuilds installments when total changes" do
      update!(total: 800, count: 4)

      @purchase.reload
      assert_equal 800.to_d, @purchase.total_amount
      assert_equal [200.to_d] * 4, @purchase.installments.order(:number).pluck(:amount)
    end

    test "rebuilds installments when count changes" do
      update!(total: 1200, count: 8)

      @purchase.reload
      assert_equal 8, @purchase.installments.count
      assert_equal [150.to_d] * 8, @purchase.installments.order(:number).pluck(:amount)
    end

    test "keeps the first installment in its cycle" do
      @purchase.installments.update_all("cycle_number = cycle_number + 2")
      first = @purchase.installments.minimum(:cycle_number)

      update!(total: 600, count: 6)

      assert_equal (first..first + 5).to_a, @purchase.reload.installments.order(:number).pluck(:cycle_number)
    end

    test "never places installments before the open cycle" do
      @purchase.installments.update_all(cycle_number: @open.number - 1)

      update!(total: 100, count: 1)

      assert_equal [@open.number], @purchase.reload.installments.pluck(:cycle_number)
    end

    test "raises EditingClosedPurchase when any installment has a cycle" do
      cycle = @user.cycles.create!(number: 99, started_at: 1.month.ago, closed_at: Time.current)
      @purchase.installments.first.update_columns(cycle_id: cycle.id)

      assert_raises(Purchases::UpdateService::EditingClosedPurchase) { update!(total: 100, count: 1) }
      assert_equal 4, @purchase.reload.installments_count
    end

    private

    def update!(total:, count:)
      Purchases::UpdateService.new(card_purchase: @purchase, total_amount: total, installments_count: count).call
    end

    def create_purchase(total:, count:)
      form = CardPurchaseForm.new(user: @user, card: @card, description: "Compra base",
                                  total_amount: total, installments_count: count)
      form.save || raise(form.errors.full_messages.inspect)
      form.card_purchase
    end
  end
end
```

- [ ] **Step 2: Escrever os testes novos (ações por compra, listagem e cabeçalho do ciclo)**

```ruby
# test/services/purchases/actions_test.rb
require "test_helper"

module Purchases
  class ActionsTest < ActiveSupport::TestCase
    setup do
      @user = User.create!(email: "act@finansheet.local", password: "secret123")
      @card = @user.cards.create!(name: "Nubank", mode: :credit)
      @open = @user.open_cycle
    end

    test "new purchase with future installments is editable and can be prepaid" do
      flags = flags_for(buy(count: 3))

      assert flags.editable
      assert flags.can_prepay
      assert_not flags.can_undo_prepay
      assert_nil flags.cancel_from
    end

    test "single installment purchase cannot be prepaid" do
      assert_not flags_for(buy(count: 1)).can_prepay
    end

    test "purchase with a closed installment suggests cancelling from the first open one" do
      purchase = buy(count: 10)
      closed = @user.cycles.create!(number: 99, started_at: 1.month.ago, closed_at: Time.current)
      purchase.installments.where(number: [1, 2]).update_all(cycle_id: closed.id)

      flags = flags_for(purchase)

      assert_not flags.editable
      assert_equal 3, flags.cancel_from
    end

    test "prepaid installments in the open cycle can be undone" do
      purchase = buy(count: 3)
      purchase.installments.where(number: [2, 3])
              .update_all(["original_cycle_number = cycle_number, cycle_number = ?", @open.number])

      flags = flags_for(purchase)

      assert flags.can_undo_prepay
      assert_not flags.can_prepay
    end

    private

    def buy(count:)
      form = CardPurchaseForm.new(user: @user, card: @card, description: "X",
                                  total_amount: 100 * count, installments_count: count)
      form.save || raise(form.errors.full_messages.inspect)
      form.card_purchase
    end

    def flags_for(purchase)
      Purchases::Actions.for([purchase], open_number: @open.number).fetch(purchase.id)
    end
  end
end
```

```ruby
# test/controllers/card_installments_controller_test.rb
require "test_helper"

class CardInstallmentsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = User.create!(email: "inst@finansheet.local", password: "secret123")
    @card = @user.cards.create!(name: "Nubank", mode: :credit)
    @auth = { "Authorization" => "Bearer #{AuthToken.encode(user_id: @user.id)}" }
    @open = @user.open_cycle
    buy(300, count: 3)
    buy(50, third_party_name: "Mãe")
  end

  test "lists the open cycle with own, third party and future totals" do
    get "/api/cards/#{@card.id}/installments", headers: @auth, as: :json

    assert_response :ok
    body = JSON.parse(response.body)
    assert_equal @open.number, body["cycle"]
    assert_equal 150.0, body["cycle_total"]
    assert_equal 100.0, body["cycle_total_own"]
    assert_equal 200.0, body["future_total"]
    assert_equal 2, body["installments"].size
    assert_equal 50.0, body["installments"].find { |i| i["third_party_name"] == "Mãe" }["amount"]
    assert(body["installments"].all? { |i| i.key?("can_prepay") && i.key?("cancel_from") })
  end

  test "lists a future cycle" do
    get "/api/cards/#{@card.id}/installments?cycle=#{@open.number + 1}", headers: @auth, as: :json

    body = JSON.parse(response.body)
    assert_equal 100.0, body["cycle_total"]
    assert_equal 100.0, body["future_total"]
  end

  private

  def buy(total, count: 1, third_party_name: nil)
    form = CardPurchaseForm.new(user: @user, card: @card, description: "X", total_amount: total,
                                installments_count: count, third_party_name:)
    form.save || raise(form.errors.full_messages.inspect)
  end
end
```

```ruby
# test/controllers/cards_controller_test.rb
require "test_helper"

class CardsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = User.create!(email: "cards@finansheet.local", password: "secret123")
    @card = @user.cards.create!(name: "Nubank", mode: :credit, best_day: 5, pay_day: 12)
    @auth = { "Authorization" => "Bearer #{AuthToken.encode(user_id: @user.id)}" }
  end

  test "new account sees the open cycle 1 without errors" do
    get "/api/cards", headers: @auth, as: :json

    assert_response :ok
    cycle = JSON.parse(response.body)["cycle"]
    assert_equal 1, cycle["number"]
    assert_equal "open", cycle["status"]
    assert_equal 1, cycle["open_number"]
    assert_equal 7, cycle["max_number"]
  end

  test "closed and upcoming cycles report their status" do
    @user.cycles.create!(number: 1, started_at: 2.months.ago, closed_at: 1.month.ago, total_income: 4000)
    open = @user.open_cycle

    get "/api/cards?cycle=1", headers: @auth, as: :json
    closed = JSON.parse(response.body)["cycle"]
    assert_equal "closed", closed["status"]
    assert_equal 4000.0, closed["expected_income"]

    get "/api/cards?cycle=#{open.number + 1}", headers: @auth, as: :json
    assert_equal "upcoming", JSON.parse(response.body)["cycle"]["status"]
  end

  test "cycle out of range falls back to the open cycle" do
    get "/api/cards?cycle=999", headers: @auth, as: :json

    assert_equal 1, JSON.parse(response.body)["cycle"]["number"]
  end

  test "cards carry the checked flag of the viewed cycle" do
    @user.open_cycle.card_checks.create!(card: @card, checked_at: Time.current)

    get "/api/cards", headers: @auth, as: :json

    assert JSON.parse(response.body)["cards"].first["checked"]
  end
end
```

Em `test/controllers/card_purchases_controller_test.rb`, acrescentar antes de `private`:

```ruby
  test "POST puts the first installment in the open cycle and keeps third party" do
    post "/api/cards/#{@card.id}/purchases",
         params: { purchase: { description: "Fogão", total_amount: 300, installments_count: 3, third_party_name: "Mãe" } },
         headers: @auth, as: :json

    assert_response :created
    body = JSON.parse(response.body)["purchase"]
    assert_equal "Mãe", body["third_party_name"]
    assert_equal @user.open_cycle.number, body["installments"].first["cycle_number"]
  end

  test "PATCH third_party sets and clears the name even with a closed installment" do
    cycle = @user.cycles.create!(number: 99, started_at: 1.month.ago, closed_at: Time.current)
    @purchase.installments.first.update_columns(cycle_id: cycle.id)

    patch "/api/cards/#{@card.id}/purchases/#{@purchase.id}/third_party",
          params: { third_party_name: "Mãe" }, headers: @auth, as: :json
    assert_response :ok
    assert_equal "Mãe", @purchase.reload.third_party_name

    patch "/api/cards/#{@card.id}/purchases/#{@purchase.id}/third_party",
          params: { third_party_name: "" }, headers: @auth, as: :json
    assert_nil @purchase.reload.third_party_name
  end
```
e no `create_purchase` do mesmo arquivo remover a linha `purchased_on: Date.new(2026, 4, 24),`.

- [ ] **Step 3: Rodar e ver falhar**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test test/forms test/services/purchases test/controllers/card_installments_controller_test.rb test/controllers/cards_controller_test.rb test/controllers/card_purchases_controller_test.rb`
Expected: FAIL (`cycle_number` nulo, `Purchases::Actions` inexistente, rota `third_party` inexistente).

- [ ] **Step 4: Implementar modelo, builder, form e update service**

Em `app/models/installment.rb`, trocar `validates :due_month, presence: true` por:

```ruby
  validates :cycle_number, numericality: { greater_than: 0, only_integer: true }
```

```ruby
# app/services/purchases/installment_builder.rb
module Purchases
  # Cria as parcelas em aberto de uma compra (installments_paid+1 até o
  # total), uma por ciclo a partir de first_cycle_number. A sobra de
  # centavos da divisão vai na última parcela.
  class InstallmentBuilder
    def initialize(card_purchase:, first_cycle_number:)
      @card_purchase      = card_purchase
      @first_cycle_number = first_cycle_number
    end

    def build!
      total = @card_purchase.total_amount.to_d
      count = @card_purchase.installments_count.to_i
      paid  = @card_purchase.installments_paid.to_i
      base  = (total / count).floor(2)
      last  = total - base * (count - 1)

      (count - paid).times do |i|
        number = paid + i + 1
        @card_purchase.installments.create!(
          number:       number,
          amount:       (number == count ? last : base),
          cycle_number: @first_cycle_number + i,
        )
      end
    end
  end
end
```

```ruby
# app/forms/card_purchase_form.rb
class CardPurchaseForm
  include ActiveModel::Model

  attr_accessor :user, :card, :description, :total_amount, :installments_count, :installments_paid, :third_party_name
  attr_reader :purchased_on, :card_purchase

  def purchased_on=(value)
    @purchased_on = parse_date(value)
  end

  validates :user,         presence: true
  validates :card,         presence: true
  validates :description,  presence: true
  validates :total_amount,       presence: true, numericality: { greater_than: 0, allow_nil: true }
  validates :installments_count, presence: true, numericality: { greater_than: 0, only_integer: true, allow_nil: true }
  validate :installments_paid_in_range

  # A próxima parcela em aberto (installments_paid + 1) cai sempre no ciclo
  # aberto, e as seguintes um ciclo depois da outra. purchased_on é só
  # histórico (default hoje).
  def save
    return false unless valid?

    ActiveRecord::Base.transaction do
      @card_purchase = CardPurchase.create!(
        user:,
        card:,
        description:,
        total_amount:,
        installments_count:,
        installments_paid: paid_count,
        purchased_on:      purchased_on || Date.current,
        third_party_name:,
      )
      Purchases::InstallmentBuilder.new(card_purchase: @card_purchase,
                                        first_cycle_number: user.open_cycle.number).build!
    end

    true
  end

  private

  def installments_paid_in_range
    return if installments_count.blank?
    paid = paid_count
    return if paid >= 0 && paid < installments_count.to_i

    errors.add(:installments_paid, "deve ser entre 0 e #{installments_count.to_i - 1}")
  end

  def paid_count
    installments_paid.to_i
  end

  def parse_date(value)
    case value
    when Date   then value
    when String then (Date.parse(value) rescue nil)
    end
  end
end
```

Em `app/services/purchases/update_service.rb`, trocar o corpo de `call` e remover o `build_installments!` privado:

```ruby
    def call
      raise self.class::EditingClosedPurchase unless @card_purchase.editable?

      ActiveRecord::Base.transaction do
        # editable? garante que nada está em ciclo fechado. A 1ª parcela em
        # aberto continua no ciclo onde estava, mas nunca antes do aberto.
        open_number  = @card_purchase.user.open_cycle.number
        first_number = [@card_purchase.installments.minimum(:cycle_number), open_number].compact.max

        @card_purchase.update!(
          total_amount:       @total_amount,
          installments_count: @installments_count,
        )
        @card_purchase.installments.destroy_all
        InstallmentBuilder.new(card_purchase: @card_purchase, first_cycle_number: first_number).build!
      end

      @card_purchase
    end
```
e trocar o comentário da classe por:
```ruby
  # Atualiza o total e a quantidade de parcelas de uma CardPurchase, recriando
  # as parcelas em aberto (installments_paid é preservado). Recusa se qualquer
  # parcela já estiver num ciclo fechado.
```

- [ ] **Step 5: Implementar `Purchases::Actions`**

```ruby
# app/services/purchases/actions.rb
module Purchases
  # O que cada compra aceita agora (editar, quitar, desfazer quitação,
  # cancelar o restante), para várias compras com uma query só — a tela
  # lista várias de uma vez.
  class Actions
    Flags = Data.define(:editable, :can_prepay, :can_undo_prepay, :cancel_from)

    # Posições das colunas lidas de cada parcela (ver pluck abaixo).
    NUMBER       = 1
    CYCLE_NUMBER = 2
    CYCLE_ID     = 3
    ORIGINAL     = 4

    def self.for(purchases, open_number:)
      rows = Installment.where(card_purchase_id: purchases.map(&:id))
                        .pluck(:card_purchase_id, :number, :cycle_number, :cycle_id, :original_cycle_number)
                        .group_by(&:first)

      purchases.to_h do |purchase|
        installments = rows.fetch(purchase.id, [])
        open_rows    = installments.reject { |row| row[CYCLE_ID] }
        any_closed   = open_rows.size < installments.size

        [purchase.id, Flags.new(
          editable:        !any_closed,
          can_prepay:      open_rows.any? { |row| row[CYCLE_NUMBER] > open_number },
          can_undo_prepay: open_rows.any? { |row| row[CYCLE_NUMBER] == open_number && row[ORIGINAL] },
          cancel_from:     any_closed ? cancel_from(purchase, open_rows) : nil,
        )]
      end
    end

    # Cancelar o restante só aparece com parcela já fechada (sem isso dá pra
    # editar ou apagar). Sugere a 1ª parcela em aberto, nunca a 1ª da compra
    # (isso seria apagar tudo).
    def self.cancel_from(purchase, open_rows)
      first_open = open_rows.map { |row| row[NUMBER] }.min
      return nil unless first_open

      from = [first_open, purchase.installments_paid + 2].max
      from <= purchase.installments_count ? from : nil
    end
    private_class_method :cancel_from
  end
end
```

- [ ] **Step 6: Implementar os controllers e a rota**

```ruby
# app/controllers/card_installments_controller.rb
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
      editable:              flags.editable,
      can_prepay:            flags.can_prepay,
      can_undo_prepay:       flags.can_undo_prepay,
      cancel_from:           flags.cancel_from,
    }
  end
end
```

```ruby
# app/controllers/cards_controller.rb — trocar o index e o parse_month
  include CycleParam

  # GET /api/cards?cycle=N — cabeçalho do ciclo visualizado + cartões, com
  # o "conferido" daquele ciclo.
  def index
    open    = current_user.open_cycle
    number  = cycle_number_param
    cycle   = current_user.cycles.find_by(number:)
    checked = cycle ? cycle.card_checks.pluck(:card_id) : []

    render json: {
      cycle: serialize_cycle(number, cycle, open),
      cards: current_user.cards.order(:created_at).map { |c| serialize(c).merge(checked: checked.include?(c.id)) },
    }
  end
```
(`include CycleParam` vai logo abaixo de `class CardsController < ApiController`.) Apagar o método privado `parse_month` e acrescentar no `private`:

```ruby
  def serialize_cycle(number, cycle, open)
    status = if cycle&.closed? then "closed"
             elsif number == open.number then "open"
             else "upcoming"
             end

    {
      number:          number,
      status:          status,
      started_at:      cycle&.started_at,
      closed_at:       cycle&.closed_at,
      expected_income: (cycle&.closed? ? cycle.total_income : open.expected_income).to_f,
      first_number:    current_user.cycles.minimum(:number),
      open_number:     open.number,
      max_number:      open.number + CycleParam::MAX_AHEAD,
    }
  end
```

Em `app/controllers/card_purchases_controller.rb`:
- `before_action :load_purchase, only: [:update, :destroy, :third_party]`
- no `create`, trocar a linha `next_due_month: ...` por `third_party_name: purchase_params[:third_party_name],`
- trocar a action `toggle_excluded` (e o comentário dela) por:

```ruby
  # PATCH .../third_party { third_party_name: "Mãe" | "" }
  # Marca ou desmarca compra de outra pessoa. Permitido mesmo com parcela em
  # ciclo fechado: não muda valores, e o retrato dos ciclos fechados fica
  # como foi gravado na virada.
  def third_party
    @purchase.update!(third_party_name: params[:third_party_name])
    render json: { purchase: serialize(@purchase) }
  end
```
- `purchase_params`: `params.require(:purchase).permit(:description, :total_amount, :installments_count, :installments_paid, :purchased_on, :third_party_name)`
- `serialize`:

```ruby
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
```

Em `config/routes.rb`, trocar `member { patch :toggle_excluded }` por `member { patch :third_party }`.

- [ ] **Step 7: Rodar e ver passar**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test`
Expected: tudo passa, exceto `test/controllers/incomes_controller_test.rb` (Income é removido no Task 6) e `test/models/user_test.rb` nos testes `next_open_cycle_month` (removidos no Task 12). Se aparecer qualquer outra falha, corrigir antes do commit.

- [ ] **Step 8: Commit**

```bash
git add -A app/models/installment.rb app/forms app/services/purchases app/controllers/card_purchases_controller.rb app/controllers/card_installments_controller.rb app/controllers/cards_controller.rb config/routes.rb test/forms test/services/purchases test/controllers
git commit -m "Place purchases and installments by cycle number"
```

---

### Task 6: Virada (retrato, fechar e abrir) e "a receber" do ciclo

**Files:**
- Create: `app/services/cycles/totals.rb`, `app/services/cycles/turn_service.rb`, `app/controllers/cycles_controller.rb`, `test/services/cycles/turn_service_test.rb`, `test/controllers/cycles_controller_test.rb`
- Modify: `config/routes.rb`, `app/models/user.rb` (sai `has_many :incomes`)
- Delete: `app/controllers/incomes_controller.rb`, `test/controllers/incomes_controller_test.rb`, `app/models/income.rb`

**Interfaces:**
- Consumes: `EnsurePaymentsForCycle` (Task 4) e `CardPurchaseForm` com `third_party_name` (Task 5).
- Produces:
  - `Cycles::Totals.new(user:, cycle_number:).call -> Result(own_cards, third_party, fixed_expenses)`, valores BigDecimal.
  - `Cycles::TurnService.new(user:, cycle_id:).call -> Cycle` (o ciclo novo). Levanta `Cycles::TurnService::AlreadyTurned`.
  - `GET /api/cycles -> { open: {id, number, started_at, expected_income, own_cards, third_party, fixed_expenses, balance}, closed: [{id, number, started_at, closed_at, income, own_cards, third_party, fixed_expenses, balance}] }`
  - `PATCH /api/cycles/current { expected_income } -> { cycle: open }`
  - `POST /api/cycles/current/turn { cycle_id } -> 201 { cycle: open }` ou `409`.

- [ ] **Step 1: Escrever os testes**

```ruby
# test/services/cycles/turn_service_test.rb
require "test_helper"

class Cycles::TurnServiceTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(email: "turn@finansheet.local", password: "secret123")
    @card = @user.cards.create!(name: "Nubank", mode: :credit)
    @open = @user.open_cycle
    @open.update!(expected_income: 5000)
  end

  test "closes the open cycle with a snapshot and opens the next one" do
    buy(300, count: 3)
    buy(50, third_party_name: "Mãe")
    # Conta fixa sem pagamento gerado: o retrato tem que incluí-la mesmo assim.
    @user.fixed_expenses.create!(name: "Aluguel", amount: 750)

    next_cycle = turn!
    closed = @open.reload

    assert closed.closed?
    assert_equal 5000.to_d, closed.total_income
    assert_equal 100.to_d,  closed.total_own_cards
    assert_equal 50.to_d,   closed.total_third_party
    assert_equal 750.to_d,  closed.total_fixed_expenses
    assert_equal closed.number + 1, next_cycle.number
    assert_equal closed.closed_at, next_cycle.started_at
    assert_equal 5000.to_d, next_cycle.expected_income
  end

  test "binds the closed cycle items and leaves future installments open" do
    purchase = buy(300, count: 3)

    turn!

    assert_equal [true, false, false], purchase.installments.order(:number).map { |i| i.cycle_id.present? }
  end

  test "creates fixed expense payments for the new cycle" do
    fe = @user.fixed_expenses.create!(name: "Internet", amount: 90)

    next_cycle = turn!

    assert fe.payments.exists?(cycle_number: next_cycle.number)
  end

  test "turning the same cycle twice raises AlreadyTurned" do
    turn!

    assert_raises(Cycles::TurnService::AlreadyTurned) { turn! }
    assert_equal 1, @user.cycles.open.count
  end

  test "does not touch other users" do
    other_open = User.create!(email: "other-turn@finansheet.local", password: "secret123").open_cycle

    turn!

    assert_not other_open.reload.closed?
  end

  private

  def buy(total, count: 1, third_party_name: nil)
    form = CardPurchaseForm.new(user: @user, card: @card, description: "X", total_amount: total,
                                installments_count: count, third_party_name:)
    form.save || raise(form.errors.full_messages.inspect)
    form.card_purchase
  end

  def turn!
    Cycles::TurnService.new(user: @user, cycle_id: @open.id).call
  end
end
```

```ruby
# test/controllers/cycles_controller_test.rb
require "test_helper"

class CyclesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = User.create!(email: "cyc@finansheet.local", password: "secret123")
    @card = @user.cards.create!(name: "Nubank", mode: :credit)
    @auth = { "Authorization" => "Bearer #{AuthToken.encode(user_id: @user.id)}" }
  end

  test "a new account gets cycle 1 with live totals" do
    buy(80)

    get "/api/cycles", headers: @auth, as: :json

    assert_response :ok
    body = JSON.parse(response.body)
    assert_equal 1, body["open"]["number"]
    assert_equal 80.0, body["open"]["own_cards"]
    assert_equal [], body["closed"]
  end

  test "PATCH current updates expected income and rejects negatives" do
    patch "/api/cycles/current", params: { expected_income: 5000 }, headers: @auth, as: :json
    assert_response :ok
    assert_equal 5000.to_d, @user.open_cycle.expected_income

    patch "/api/cycles/current", params: { expected_income: -1 }, headers: @auth, as: :json
    assert_response :unprocessable_entity
  end

  test "POST turn twice with the same cycle id returns 409 the second time" do
    open = @user.open_cycle

    post "/api/cycles/current/turn", params: { cycle_id: open.id }, headers: @auth, as: :json
    assert_response :created
    assert_equal 2, JSON.parse(response.body)["cycle"]["number"]

    post "/api/cycles/current/turn", params: { cycle_id: open.id }, headers: @auth, as: :json
    assert_response :conflict
    assert_equal 2, @user.cycles.count
  end

  test "closed cycles appear with their snapshot" do
    open = @user.open_cycle
    open.update!(expected_income: 3000)
    buy(500)
    Cycles::TurnService.new(user: @user, cycle_id: open.id).call

    get "/api/cycles", headers: @auth, as: :json

    closed = JSON.parse(response.body)["closed"].first
    assert_equal 3000.0, closed["income"]
    assert_equal 500.0, closed["own_cards"]
    assert_equal 2500.0, closed["balance"]
  end

  private

  def buy(total)
    form = CardPurchaseForm.new(user: @user, card: @card, description: "X", total_amount: total, installments_count: 1)
    form.save || raise(form.errors.full_messages.inspect)
  end
end
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test test/services/cycles test/controllers/cycles_controller_test.rb`
Expected: FAIL com `uninitialized constant Cycles::TurnService` e `No route matches [GET] "/api/cycles"`.

- [ ] **Step 3: Implementar serviços**

```ruby
# app/services/cycles/totals.rb
module Cycles
  # Soma o que cai num número de ciclo: parcelas do usuário, parcelas de
  # terceiros e contas fixas. Base do retrato da virada e dos resumos.
  class Totals
    Result = Data.define(:own_cards, :third_party, :fixed_expenses)

    def initialize(user:, cycle_number:)
      @user = user
      @cycle_number = cycle_number
    end

    def call
      installments = Installment.joins(:card_purchase)
                                .where(card_purchases: { user_id: @user.id }, cycle_number: @cycle_number)

      Result.new(
        own_cards:      installments.where(card_purchases: { third_party_name: nil }).sum(:amount),
        third_party:    installments.where.not(card_purchases: { third_party_name: nil }).sum(:amount),
        fixed_expenses: FixedExpensePayment.joins(:fixed_expense)
                                           .where(fixed_expenses: { user_id: @user.id }, cycle_number: @cycle_number)
                                           .sum(:amount),
      )
    end
  end
end
```

```ruby
# app/services/cycles/turn_service.rb
module Cycles
  # Vira o ciclo: fecha o aberto gravando o retrato (renda, cartões,
  # terceiros, contas fixas), amarra parcelas e contas a ele e abre o
  # próximo com a mesma renda prevista. Recebe o id do ciclo que a tela
  # mostrava, então clique duplo / duas abas não viram dois ciclos.
  class TurnService
    class AlreadyTurned < StandardError; end

    def initialize(user:, cycle_id:)
      @user = user
      @cycle_id = cycle_id
    end

    def call
      ActiveRecord::Base.transaction do
        @user.lock!
        cycle = @user.cycles.open.find_by(id: @cycle_id)
        raise AlreadyTurned unless cycle

        # Conta fixa que o usuário nunca listou neste ciclo ainda não tem
        # pagamento; sem isso ficaria fora do retrato.
        FixedExpenses::EnsurePaymentsForCycle.new(user: @user, cycle_number: cycle.number).call
        close!(cycle)

        next_cycle = @user.cycles.create!(number: cycle.number + 1, started_at: cycle.closed_at,
                                          expected_income: cycle.expected_income)
        FixedExpenses::EnsurePaymentsForCycle.new(user: @user, cycle_number: next_cycle.number).call
        next_cycle
      end
    end

    private

    def close!(cycle)
      totals = Totals.new(user: @user, cycle_number: cycle.number).call

      Installment.joins(:card_purchase)
                 .where(card_purchases: { user_id: @user.id }, cycle_number: cycle.number)
                 .update_all(cycle_id: cycle.id)
      FixedExpensePayment.joins(:fixed_expense)
                         .where(fixed_expenses: { user_id: @user.id }, cycle_number: cycle.number)
                         .update_all(cycle_id: cycle.id)

      cycle.update!(
        closed_at:            Time.current,
        total_income:         cycle.expected_income,
        total_own_cards:      totals.own_cards,
        total_third_party:    totals.third_party,
        total_fixed_expenses: totals.fixed_expenses,
      )
    end
  end
end
```

- [ ] **Step 4: Implementar controller e rotas; remover a renda por mês**

```ruby
# app/controllers/cycles_controller.rb
class CyclesController < ApiController
  # GET /api/cycles — ciclo aberto (totais ao vivo) e fechados (retrato).
  def index
    open = current_user.open_cycle
    FixedExpenses::EnsurePaymentsForCycle.new(user: current_user, cycle_number: open.number).call

    render json: {
      open:   serialize_open(open),
      closed: current_user.cycles.closed.order(number: :desc).map { |c| serialize_closed(c) },
    }
  end

  # PATCH /api/cycles/current { expected_income } — o "a receber" do ciclo aberto.
  def update_current
    cycle = current_user.open_cycle

    if cycle.update(expected_income: params.require(:expected_income))
      render json: { cycle: serialize_open(cycle) }
    else
      render json: { errors: cycle.errors.full_messages }, status: :unprocessable_entity
    end
  end

  # POST /api/cycles/current/turn { cycle_id }
  def turn
    new_cycle = Cycles::TurnService.new(user: current_user, cycle_id: params.require(:cycle_id)).call
    render json: { cycle: serialize_open(new_cycle) }, status: :created
  rescue Cycles::TurnService::AlreadyTurned
    render json: { errors: ["esse ciclo já foi virado"] }, status: :conflict
  end

  private

  def serialize_open(cycle)
    totals = Cycles::Totals.new(user: current_user, cycle_number: cycle.number).call

    {
      id:              cycle.id,
      number:          cycle.number,
      started_at:      cycle.started_at,
      expected_income: cycle.expected_income.to_f,
      own_cards:       totals.own_cards.to_f,
      third_party:     totals.third_party.to_f,
      fixed_expenses:  totals.fixed_expenses.to_f,
      balance:         (cycle.expected_income - totals.own_cards - totals.fixed_expenses).to_f,
    }
  end

  def serialize_closed(cycle)
    {
      id:             cycle.id,
      number:         cycle.number,
      started_at:     cycle.started_at,
      closed_at:      cycle.closed_at,
      income:         cycle.total_income.to_f,
      own_cards:      cycle.total_own_cards.to_f,
      third_party:    cycle.total_third_party.to_f,
      fixed_expenses: cycle.total_fixed_expenses.to_f,
      balance:        (cycle.total_income - cycle.total_own_cards - cycle.total_fixed_expenses).to_f,
    }
  end
end
```

Em `config/routes.rb`, dentro do `scope :api`, trocar

```ruby
    get "incomes" => "incomes#show"
    put "incomes" => "incomes#upsert"
```
por
```ruby
    get   "cycles"              => "cycles#index"
    patch "cycles/current"      => "cycles#update_current"
    post  "cycles/current/turn" => "cycles#turn"
```

```bash
git rm app/controllers/incomes_controller.rb test/controllers/incomes_controller_test.rb app/models/income.rb
```
Em `app/models/user.rb`, apagar a linha `has_many :incomes,        dependent: :destroy`.

- [ ] **Step 5: Rodar e ver passar**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test test/services/cycles test/controllers/cycles_controller_test.rb`
Expected: PASS (9 testes).

- [ ] **Step 6: Commit**

```bash
git add -A app/services/cycles app/controllers/cycles_controller.rb app/controllers/incomes_controller.rb app/models config/routes.rb test/services/cycles test/controllers
git commit -m "Turn cycle with snapshot and expected income per cycle"
```

---

### Task 7: Desfazer a última virada

**Files:**
- Create: `app/services/cycles/undo_turn_service.rb`, `test/services/cycles/undo_turn_service_test.rb`
- Modify: `app/controllers/cycles_controller.rb`, `config/routes.rb`, `test/controllers/cycles_controller_test.rb`

**Interfaces:**
- Consumes: `Cycles::TurnService` (Task 6).
- Produces:
  - `Cycles::UndoTurnService.new(user:).blocker -> String | nil`
  - `Cycles::UndoTurnService.new(user:).call -> Cycle` (o ciclo reaberto). Levanta `Cycles::UndoTurnService::NotAllowed` com o motivo.
  - `POST /api/cycles/last/undo -> { cycle: open }` ou `422 { errors: [motivo] }`.
  - `GET /api/cycles` ganha `can_undo: Boolean`.

- [ ] **Step 1: Escrever os testes**

```ruby
# test/services/cycles/undo_turn_service_test.rb
require "test_helper"

class Cycles::UndoTurnServiceTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(email: "undo@finansheet.local", password: "secret123")
    @card = @user.cards.create!(name: "Nubank", mode: :credit)
    @first = @user.open_cycle
    @first.update!(expected_income: 5000)
    buy(300, count: 3)
    @fixed = @user.fixed_expenses.create!(name: "Aluguel", amount: 750)
    @second = Cycles::TurnService.new(user: @user, cycle_id: @first.id).call
  end

  test "reopens the previous cycle and removes the new one" do
    reopened = undo!

    assert_equal @first.id, reopened.id
    assert_not reopened.reload.closed?
    assert_equal 0.to_d, reopened.total_own_cards
    assert_not Cycle.exists?(@second.id)
    assert_equal 0, Installment.where.not(cycle_id: nil).count
    assert_equal 0, FixedExpensePayment.where(cycle_number: @second.number).count
    assert_equal 1, FixedExpensePayment.where(cycle_number: @first.number, cycle_id: nil).count
  end

  test "can turn again after undo" do
    undo!

    assert_equal @second.number, Cycles::TurnService.new(user: @user, cycle_id: @first.id).call.number
  end

  test "blocked once a purchase is registered in the new cycle" do
    travel 1.second
    buy(10)

    error = assert_raises(Cycles::UndoTurnService::NotAllowed) { undo! }
    assert_match "compra", error.message
    assert @first.reload.closed?
  end

  test "blocked once a fixed expense is paid in the new cycle" do
    @fixed.payments.find_by!(cycle_number: @second.number).update!(paid_at: Time.current)

    assert_raises(Cycles::UndoTurnService::NotAllowed) { undo! }
  end

  test "blocked once a card is checked in the new cycle" do
    @second.card_checks.create!(card: @card, checked_at: Time.current)

    assert_raises(Cycles::UndoTurnService::NotAllowed) { undo! }
  end

  test "not allowed when there is no previous turn" do
    fresh = User.create!(email: "fresh@finansheet.local", password: "secret123")

    assert_equal "não há virada para desfazer", Cycles::UndoTurnService.new(user: fresh).blocker
  end

  private

  def buy(total, count: 1)
    form = CardPurchaseForm.new(user: @user, card: @card, description: "X", total_amount: total, installments_count: count)
    form.save || raise(form.errors.full_messages.inspect)
    form.card_purchase
  end

  def undo!
    Cycles::UndoTurnService.new(user: @user).call
  end
end
```

Acrescentar em `test/controllers/cycles_controller_test.rb`, antes de `private`:

```ruby
  test "POST undo explains why when not allowed, and reopens the last cycle when allowed" do
    post "/api/cycles/last/undo", headers: @auth, as: :json
    assert_response :unprocessable_entity
    assert_equal ["não há virada para desfazer"], JSON.parse(response.body)["errors"]

    Cycles::TurnService.new(user: @user, cycle_id: @user.open_cycle.id).call
    get "/api/cycles", headers: @auth, as: :json
    assert JSON.parse(response.body)["can_undo"]

    post "/api/cycles/last/undo", headers: @auth, as: :json
    assert_response :ok
    assert_equal 1, JSON.parse(response.body)["cycle"]["number"]
  end
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test test/services/cycles/undo_turn_service_test.rb test/controllers/cycles_controller_test.rb`
Expected: FAIL com `uninitialized constant Cycles::UndoTurnService`.

- [ ] **Step 3: Implementar**

```ruby
# app/services/cycles/undo_turn_service.rb
module Cycles
  # Desfaz a última virada enquanto o ciclo novo está intocado (virou por
  # engano ou cedo demais): apaga o ciclo novo e reabre o anterior.
  class UndoTurnService
    class NotAllowed < StandardError; end

    def initialize(user:)
      @user = user
    end

    # Motivo que impede desfazer, ou nil quando pode.
    def blocker
      open = @user.cycles.open.first
      last = @user.cycles.closed.order(number: :desc).first
      return "não há virada para desfazer" unless open && last && last.number == open.number - 1
      return "já tem compra lançada no ciclo novo" if @user.card_purchases.where("card_purchases.created_at > ?", open.started_at).exists?
      return "já tem conta fixa paga no ciclo novo" if payments_of(open).where.not(paid_at: nil).exists?
      return "já tem cartão conferido no ciclo novo" if open.card_checks.exists?
      return "já tem parcela antecipada para o ciclo novo" if installments_of(open).where.not(original_cycle_number: nil).exists?

      nil
    end

    def call
      ActiveRecord::Base.transaction do
        @user.lock!
        reason = blocker
        raise NotAllowed, reason if reason

        open = @user.cycles.open.first
        last = @user.cycles.closed.order(number: :desc).first

        payments_of(open).delete_all
        open.destroy!
        Installment.where(cycle_id: last.id).update_all(cycle_id: nil)
        FixedExpensePayment.where(cycle_id: last.id).update_all(cycle_id: nil)
        # update_columns: o Closable bloqueia update de ciclo fechado.
        last.update_columns(closed_at: nil, total_income: 0, total_own_cards: 0,
                            total_third_party: 0, total_fixed_expenses: 0)
        last
      end
    end

    private

    def payments_of(cycle)
      FixedExpensePayment.where(fixed_expense_id: @user.fixed_expenses.select(:id), cycle_number: cycle.number)
    end

    def installments_of(cycle)
      Installment.joins(:card_purchase).where(card_purchases: { user_id: @user.id }, cycle_number: cycle.number)
    end
  end
end
```

Em `app/controllers/cycles_controller.rb`:
- no `index`, acrescentar ao hash a linha `can_undo: Cycles::UndoTurnService.new(user: current_user).blocker.nil?,`
- acrescentar a action:

```ruby
  # POST /api/cycles/last/undo
  def undo
    cycle = Cycles::UndoTurnService.new(user: current_user).call
    render json: { cycle: serialize_open(cycle) }
  rescue Cycles::UndoTurnService::NotAllowed => e
    render json: { errors: [e.message] }, status: :unprocessable_entity
  end
```

Em `config/routes.rb`, abaixo de `post "cycles/current/turn"`: `post  "cycles/last/undo"    => "cycles#undo"`.

- [ ] **Step 4: Rodar e ver passar**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test test/services/cycles test/controllers/cycles_controller_test.rb`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/cycles/undo_turn_service.rb app/controllers/cycles_controller.rb config/routes.rb test/services/cycles/undo_turn_service_test.rb test/controllers/cycles_controller_test.rb
git commit -m "Undo the last cycle turn while the new cycle is untouched"
```

---

### Task 8: "Conferido ✓" do cartão no ciclo aberto

**Files:**
- Create: `app/controllers/cycle_card_checks_controller.rb`, `test/controllers/cycle_card_checks_controller_test.rb`
- Modify: `config/routes.rb`

**Interfaces:**
- Consumes: `CycleCardCheck` (Task 3).
- Produces: `PUT` e `DELETE /api/cycles/current/cards/:card_id/check -> { card_id, checked_at }`.

- [ ] **Step 1: Escrever os testes**

```ruby
# test/controllers/cycle_card_checks_controller_test.rb
require "test_helper"

class CycleCardChecksControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = User.create!(email: "check@finansheet.local", password: "secret123")
    @card = @user.cards.create!(name: "Nubank", mode: :credit)
    @auth = { "Authorization" => "Bearer #{AuthToken.encode(user_id: @user.id)}" }
  end

  test "PUT marks the card as checked in the open cycle and is idempotent" do
    2.times do
      put "/api/cycles/current/cards/#{@card.id}/check", headers: @auth, as: :json
      assert_response :ok
    end

    assert_equal 1, @user.open_cycle.card_checks.where(card: @card).count
  end

  test "DELETE unchecks" do
    @user.open_cycle.card_checks.create!(card: @card, checked_at: Time.current)

    delete "/api/cycles/current/cards/#{@card.id}/check", headers: @auth, as: :json

    assert_response :ok
    assert_equal 0, CycleCardCheck.count
  end

  test "another user's card is not found" do
    other_card = User.create!(email: "x@finansheet.local", password: "secret123").cards.create!(name: "Itaú", mode: :credit)

    put "/api/cycles/current/cards/#{other_card.id}/check", headers: @auth, as: :json

    assert_response :not_found
  end
end
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test test/controllers/cycle_card_checks_controller_test.rb`
Expected: FAIL com `No route matches [PUT]`.

- [ ] **Step 3: Implementar**

```ruby
# app/controllers/cycle_card_checks_controller.rb
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
```

Em `config/routes.rb`, abaixo de `post "cycles/last/undo"`:

```ruby
    put    "cycles/current/cards/:card_id/check" => "cycle_card_checks#create"
    delete "cycles/current/cards/:card_id/check" => "cycle_card_checks#destroy"
```

- [ ] **Step 4: Rodar e ver passar**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test test/controllers/cycle_card_checks_controller_test.rb`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/controllers/cycle_card_checks_controller.rb config/routes.rb test/controllers/cycle_card_checks_controller_test.rb
git commit -m "Card check per cycle"
```

---

### Task 9: Quitar o restante (e desfazer) e cancelar o restante

**Files:**
- Create: `app/services/purchases/prepay_service.rb`, `app/services/purchases/undo_prepay_service.rb`, `app/services/purchases/cancel_remaining_service.rb`, `test/services/purchases/prepay_services_test.rb`, `test/services/purchases/cancel_remaining_service_test.rb`
- Modify: `app/controllers/card_purchases_controller.rb`, `config/routes.rb`, `test/controllers/card_purchases_controller_test.rb`

**Interfaces:**
- Consumes: `User#open_cycle` e `Cycles::TurnService` (no teste).
- Produces:
  - `Purchases::PrepayService.new(card_purchase:).call`, que levanta `NothingToPrepay`.
  - `Purchases::UndoPrepayService.new(card_purchase:).call`, que levanta `NothingToUndo`.
  - `Purchases::CancelRemainingService.new(card_purchase:, from_number:).call`, que levanta `InvalidStart` com a mensagem para o usuário.
  - `POST` e `DELETE .../purchases/:id/prepay`, e `POST .../purchases/:id/cancel_remaining { from_number }`. Todos respondem `{ purchase }` ou `422 { errors }`.

- [ ] **Step 1: Escrever os testes dos serviços**

```ruby
# test/services/purchases/prepay_services_test.rb
require "test_helper"

module Purchases
  class PrepayServicesTest < ActiveSupport::TestCase
    setup do
      @user = User.create!(email: "pre@finansheet.local", password: "secret123")
      @card = @user.cards.create!(name: "Nubank", mode: :credit)
      @open = @user.open_cycle
      form = CardPurchaseForm.new(user: @user, card: @card, description: "Celular", total_amount: 300, installments_count: 3)
      form.save || raise(form.errors.full_messages.inspect)
      @purchase = form.card_purchase
    end

    test "prepay brings future installments to the open cycle and remembers where they were" do
      Purchases::PrepayService.new(card_purchase: @purchase).call

      rows = @purchase.installments.order(:number).pluck(:cycle_number, :original_cycle_number)
      assert_equal [[@open.number, nil], [@open.number, @open.number + 1], [@open.number, @open.number + 2]], rows
    end

    test "prepay without future installments raises" do
      Purchases::PrepayService.new(card_purchase: @purchase).call

      assert_raises(Purchases::PrepayService::NothingToPrepay) do
        Purchases::PrepayService.new(card_purchase: @purchase).call
      end
    end

    test "undo puts installments back" do
      Purchases::PrepayService.new(card_purchase: @purchase).call
      Purchases::UndoPrepayService.new(card_purchase: @purchase).call

      rows = @purchase.installments.order(:number).pluck(:cycle_number, :original_cycle_number)
      assert_equal [[@open.number, nil], [@open.number + 1, nil], [@open.number + 2, nil]], rows
    end

    test "undo is not possible after the cycle turned" do
      Purchases::PrepayService.new(card_purchase: @purchase).call
      Cycles::TurnService.new(user: @user, cycle_id: @open.id).call

      assert_raises(Purchases::UndoPrepayService::NothingToUndo) do
        Purchases::UndoPrepayService.new(card_purchase: @purchase.reload).call
      end
    end
  end
end
```

```ruby
# test/services/purchases/cancel_remaining_service_test.rb
require "test_helper"

module Purchases
  class CancelRemainingServiceTest < ActiveSupport::TestCase
    setup do
      @user   = User.create!(email: "cancel@finansheet.local", password: "secret123")
      @card   = @user.cards.create!(name: "Nubank PJ", mode: :credit)
      @open   = @user.open_cycle
      @closed = @user.cycles.create!(number: 99, started_at: 2.months.ago, closed_at: 1.month.ago)
      @purchase = buy("Academia", total: 1390, count: 10)
      @purchase.installments.where(number: [1, 2]).update_all(cycle_id: @closed.id)
    end

    test "cancels from the given installment and fixes the total" do
      cancel!(@purchase, 3)

      @purchase.reload
      assert_equal 2, @purchase.installments_count
      assert_equal 278.to_d, @purchase.total_amount
      assert_equal [1, 2], @purchase.installments.order(:number).pluck(:number)
      assert @purchase.cancelled_at.present?
    end

    test "refuses to cancel an installment of a closed cycle" do
      error = assert_raises(Purchases::CancelRemainingService::InvalidStart) { cancel!(@purchase, 2) }

      assert_match "ciclo já fechado", error.message
      assert_equal 10, @purchase.reload.installments.count
    end

    test "refuses to cancel the whole purchase" do
      @purchase.installments.update_all(cycle_id: nil)

      error = assert_raises(Purchases::CancelRemainingService::InvalidStart) { cancel!(@purchase, 1) }

      assert_match "apague a compra", error.message
    end

    test "refuses an installment that does not exist" do
      assert_raises(Purchases::CancelRemainingService::InvalidStart) { cancel!(@purchase, 11) }
      assert_raises(Purchases::CancelRemainingService::InvalidStart) { cancel!(@purchase, "abc") }
    end

    test "counts installments paid before registration in the new total" do
      tv = buy("TV", total: 700, count: 7, paid: 2) # parcelas 3..7 de 100
      tv.installments.where(number: 3).update_all(cycle_id: @closed.id)

      cancel!(tv, 4)

      tv.reload
      assert_equal 3, tv.installments_count
      assert_equal 300.to_d, tv.total_amount
    end

    private

    def buy(description, total:, count:, paid: 0)
      form = CardPurchaseForm.new(user: @user, card: @card, description:, total_amount: total,
                                  installments_count: count, installments_paid: paid)
      form.save || raise(form.errors.full_messages.inspect)
      form.card_purchase
    end

    def cancel!(purchase, from)
      Purchases::CancelRemainingService.new(card_purchase: purchase, from_number: from).call
    end
  end
end
```

Acrescentar em `test/controllers/card_purchases_controller_test.rb`, antes de `private`:

```ruby
  test "POST prepay and DELETE prepay" do
    post "/api/cards/#{@card.id}/purchases/#{@purchase.id}/prepay", headers: @auth, as: :json
    assert_response :ok
    assert_equal [@user.open_cycle.number], @purchase.reload.installments.distinct.pluck(:cycle_number)

    delete "/api/cards/#{@card.id}/purchases/#{@purchase.id}/prepay", headers: @auth, as: :json
    assert_response :ok
    assert_equal 4, @purchase.reload.installments.distinct.count(:cycle_number)
  end

  test "POST cancel_remaining refuses a closed installment and cancels an open one" do
    cycle = @user.cycles.create!(number: 99, started_at: 1.month.ago, closed_at: Time.current)
    @purchase.installments.where(number: 1).update_all(cycle_id: cycle.id)

    post "/api/cards/#{@card.id}/purchases/#{@purchase.id}/cancel_remaining",
         params: { from_number: 1 }, headers: @auth, as: :json
    assert_response :unprocessable_entity

    post "/api/cards/#{@card.id}/purchases/#{@purchase.id}/cancel_remaining",
         params: { from_number: 2 }, headers: @auth, as: :json
    assert_response :ok
    assert_equal 1, @purchase.reload.installments_count
    assert_equal 300.to_d, @purchase.total_amount
  end
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test test/services/purchases test/controllers/card_purchases_controller_test.rb`
Expected: FAIL com `uninitialized constant Purchases::PrepayService` e rotas inexistentes.

- [ ] **Step 3: Implementar os serviços**

```ruby
# app/services/purchases/prepay_service.rb
module Purchases
  # Quitar o restante: as parcelas de ciclos futuros vêm para o ciclo aberto
  # e somam no que o usuário paga nesta virada. O ciclo de origem fica em
  # original_cycle_number para permitir desfazer.
  class PrepayService
    class NothingToPrepay < StandardError; end

    def initialize(card_purchase:)
      @card_purchase = card_purchase
    end

    def call
      open_number = @card_purchase.user.open_cycle.number
      future = @card_purchase.installments.where(cycle_id: nil).where("cycle_number > ?", open_number)
      raise NothingToPrepay if future.none?

      future.update_all(["original_cycle_number = cycle_number, cycle_number = ?", open_number])
      @card_purchase
    end
  end
end
```

```ruby
# app/services/purchases/undo_prepay_service.rb
module Purchases
  # Desfaz a quitação enquanto o ciclo aberto não virou: as parcelas
  # antecipadas voltam para os ciclos de origem.
  class UndoPrepayService
    class NothingToUndo < StandardError; end

    def initialize(card_purchase:)
      @card_purchase = card_purchase
    end

    def call
      open_number = @card_purchase.user.open_cycle.number
      prepaid = @card_purchase.installments
                              .where(cycle_id: nil, cycle_number: open_number)
                              .where.not(original_cycle_number: nil)
      raise NothingToUndo if prepaid.none?

      # No Postgres o SET usa os valores antigos da linha: cycle_number recebe
      # o original antes de ele virar NULL.
      prepaid.update_all("cycle_number = original_cycle_number, original_cycle_number = NULL")
      @card_purchase
    end
  end
end
```

```ruby
# app/services/purchases/cancel_remaining_service.rb
module Purchases
  # Cancela as parcelas a partir de from_number (ex.: assinatura cancelada no
  # meio). A compra passa a ter só as parcelas anteriores e o total é
  # corrigido para o que de fato foi pago.
  class CancelRemainingService
    class InvalidStart < StandardError; end

    def initialize(card_purchase:, from_number:)
      @card_purchase = card_purchase
      @from_number   = Integer(from_number.to_s, exception: false)
    end

    def call
      validate!

      ActiveRecord::Base.transaction do
        kept_total = kept_amount
        cancelled.delete_all
        @card_purchase.update!(installments_count: @from_number - 1, total_amount: kept_total,
                               cancelled_at: Time.current)
      end

      @card_purchase
    end

    private

    def validate!
      raise InvalidStart, "parcela inválida" if @from_number.nil? || cancelled.none?
      raise InvalidStart, "não dá para cancelar parcela de ciclo já fechado" if cancelled.where.not(cycle_id: nil).exists?
      return if @from_number > @card_purchase.installments_paid + 1

      raise InvalidStart, "para cancelar a compra inteira, apague a compra"
    end

    def cancelled
      @card_purchase.installments.where("number >= ?", @from_number)
    end

    # Parcelas pagas antes do cadastro (installments_paid) não viram linha;
    # valem o mesmo valor-base da divisão.
    def kept_amount
      base = (@card_purchase.total_amount / @card_purchase.installments_count).floor(2)
      base * @card_purchase.installments_paid + @card_purchase.installments.where("number < ?", @from_number).sum(:amount)
    end
  end
end
```

- [ ] **Step 4: Implementar as actions e rotas**

Em `app/controllers/card_purchases_controller.rb`:
- `before_action :load_purchase, only: [:update, :destroy, :third_party, :prepay, :undo_prepay, :cancel_remaining]`
- acrescentar depois de `third_party`:

```ruby
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
```

Em `config/routes.rb`, trocar `member { patch :third_party }` por:

```ruby
        member do
          patch  :third_party
          post   :prepay
          delete :prepay, action: :undo_prepay
          post   :cancel_remaining
        end
```

- [ ] **Step 5: Rodar e ver passar**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test test/services/purchases test/controllers/card_purchases_controller_test.rb`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/services/purchases app/controllers/card_purchases_controller.rb config/routes.rb test/services/purchases test/controllers/card_purchases_controller_test.rb
git commit -m "Prepay, undo prepay and cancel remaining installments"
```

---

### Task 10: "Me devem" (compras de outras pessoas e devolução)

**Files:**
- Create: `app/services/debts/query.rb`, `app/services/debts/reimburse_service.rb`, `app/controllers/debts_controller.rb`, `test/services/debts/query_test.rb`, `test/controllers/debts_controller_test.rb`
- Modify: `config/routes.rb`

**Interfaces:**
- Consumes: `CardPurchase#third_party_name`, `Installment#reimbursed_at`.
- Produces:
  - `Debts::Query.new(user:).call -> [Debt(name, total, items: [Item(installment_id, description, number, installments_count, amount, cycle_number)])]`
  - `Debts::Query.new(user:).known_names -> [String]`
  - `Debts::Query.key(name) -> String`
  - `Debts::ReimburseService.new(user:, installment_ids:).call -> Integer`
  - `GET /api/debts -> { debts: [...], known_names: [...] }`
  - `POST /api/debts/reimburse { installment_ids: [...] } -> { reimbursed: n }`

- [ ] **Step 1: Escrever os testes**

```ruby
# test/services/debts/query_test.rb
require "test_helper"

module Debts
  class QueryTest < ActiveSupport::TestCase
    setup do
      @user = User.create!(email: "debts@finansheet.local", password: "secret123")
      @card = @user.cards.create!(name: "Nubank", mode: :credit)
      @open = @user.open_cycle
    end

    test "groups by person ignoring case and accents, only up to the open cycle" do
      buy("Mãe", 300, count: 3) # 100 no ciclo aberto, 200 nos próximos
      buy("mae", 50)
      buy("Pedro", 20)

      debts = Debts::Query.new(user: @user).call

      assert_equal ["Mãe", "Pedro"], debts.map(&:name)
      assert_equal 150.to_d, debts.first.total
      assert_equal 2, debts.first.items.size
    end

    test "ignores own purchases and reimbursed installments" do
      CardPurchaseForm.new(user: @user, card: @card, description: "Minha", total_amount: 10, installments_count: 1).save
      buy("Mãe", 40).installments.update_all(reimbursed_at: Time.current)

      assert_empty Debts::Query.new(user: @user).call
    end

    test "known_names keeps the first spelling of each person" do
      buy("Mãe", 10)
      buy("mae", 10)
      buy("Pedro", 10)

      assert_equal ["Mãe", "Pedro"], Debts::Query.new(user: @user).known_names
    end

    test "reimburse marks only this user's third party installments" do
      mine = buy("Mãe", 40)
      other = User.create!(email: "other-debt@finansheet.local", password: "secret123")
      other_form = CardPurchaseForm.new(user: other, card: other.cards.create!(name: "Itaú", mode: :credit),
                                        description: "Y", total_amount: 10, installments_count: 1, third_party_name: "Ana")
      other_form.save || raise(other_form.errors.full_messages.inspect)
      ids = mine.installments.pluck(:id) + other_form.card_purchase.installments.pluck(:id)

      assert_equal 1, Debts::ReimburseService.new(user: @user, installment_ids: ids).call
      assert_nil other_form.card_purchase.installments.first.reimbursed_at
    end

    private

    def buy(name, total, count: 1)
      form = CardPurchaseForm.new(user: @user, card: @card, description: "Compra #{name}", total_amount: total,
                                  installments_count: count, third_party_name: name)
      form.save || raise(form.errors.full_messages.inspect)
      form.card_purchase
    end
  end
end
```

```ruby
# test/controllers/debts_controller_test.rb
require "test_helper"

class DebtsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = User.create!(email: "debtc@finansheet.local", password: "secret123")
    @card = @user.cards.create!(name: "Nubank", mode: :credit)
    @auth = { "Authorization" => "Bearer #{AuthToken.encode(user_id: @user.id)}" }
    form = CardPurchaseForm.new(user: @user, card: @card, description: "Fogão", total_amount: 97.66,
                                installments_count: 1, third_party_name: "Mãe")
    form.save || raise(form.errors.full_messages.inspect)
    @installment = form.card_purchase.installments.first
  end

  test "GET lists people and known names" do
    get "/api/debts", headers: @auth, as: :json

    assert_response :ok
    body = JSON.parse(response.body)
    assert_equal ["Mãe"], body["known_names"]
    assert_equal 97.66, body["debts"].first["total"]
    assert_equal "Fogão", body["debts"].first["items"].first["description"]
  end

  test "POST reimburse marks the installments" do
    post "/api/debts/reimburse", params: { installment_ids: [@installment.id] }, headers: @auth, as: :json

    assert_response :ok
    assert_equal 1, JSON.parse(response.body)["reimbursed"]
    assert @installment.reload.reimbursed_at.present?
  end
end
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test test/services/debts test/controllers/debts_controller_test.rb`
Expected: FAIL com `uninitialized constant Debts`.

- [ ] **Step 3: Implementar**

```ruby
# app/services/debts/query.rb
module Debts
  # O que outras pessoas devem: parcelas de compras de terceiros que já
  # caíram (ciclo aberto ou anteriores) e ainda não foram devolvidas.
  # Agrupa pelo nome sem diferenciar maiúsculas e acentos ("Mãe" e "mae"
  # são a mesma pessoa); o nome mostrado é o primeiro usado.
  class Query
    Item = Data.define(:installment_id, :description, :number, :installments_count, :amount, :cycle_number)
    Debt = Data.define(:name, :total, :items)

    def self.key(name)
      I18n.transliterate(name.to_s).downcase.squish
    end

    def initialize(user:)
      @user = user
    end

    def call
      rows.group_by { |row| self.class.key(row.first) }.values.map do |group|
        items = group.map do |_name, id, description, number, count, amount, cycle_number|
          Item.new(installment_id: id, description:, number:, installments_count: count, amount:, cycle_number:)
        end
        Debt.new(name: group.first.first, total: items.sum(&:amount), items:)
      end.sort_by { |debt| self.class.key(debt.name) }
    end

    # Nomes já usados, para sugerir no formulário.
    def known_names
      @user.card_purchases.where.not(third_party_name: nil).order(:created_at).pluck(:third_party_name)
           .uniq { |name| self.class.key(name) }
           .sort_by { |name| self.class.key(name) }
    end

    private

    def rows
      Installment.joins(:card_purchase)
                 .where(card_purchases: { user_id: @user.id }, reimbursed_at: nil)
                 .where.not(card_purchases: { third_party_name: nil })
                 .where(installments: { cycle_number: ..@user.open_cycle.number })
                 .order("installments.cycle_number", "card_purchases.created_at")
                 .pluck("card_purchases.third_party_name", "installments.id", "card_purchases.description",
                        "installments.number", "card_purchases.installments_count", "installments.amount",
                        "installments.cycle_number")
    end
  end
end
```

```ruby
# app/services/debts/reimburse_service.rb
module Debts
  # Marca parcelas de terceiros como devolvidas. Vale também para parcelas
  # de ciclo fechado: é só um registro, não muda o retrato do ciclo.
  class ReimburseService
    def initialize(user:, installment_ids:)
      @user = user
      @installment_ids = Array(installment_ids)
    end

    def call
      Installment.joins(:card_purchase)
                 .where(card_purchases: { user_id: @user.id })
                 .where.not(card_purchases: { third_party_name: nil })
                 .where(id: @installment_ids, reimbursed_at: nil)
                 .update_all(reimbursed_at: Time.current)
    end
  end
end
```

```ruby
# app/controllers/debts_controller.rb
class DebtsController < ApiController
  # GET /api/debts — quanto cada pessoa deve + nomes já usados.
  def index
    query = Debts::Query.new(user: current_user)

    render json: {
      debts:       query.call.map { |debt| serialize(debt) },
      known_names: query.known_names,
    }
  end

  # POST /api/debts/reimburse { installment_ids: [...] }
  def reimburse
    count = Debts::ReimburseService.new(user: current_user, installment_ids: params.require(:installment_ids)).call
    render json: { reimbursed: count }
  end

  private

  def serialize(debt)
    {
      name:  debt.name,
      total: debt.total.to_f,
      items: debt.items.map { |item| item.to_h.merge(amount: item.amount.to_f) },
    }
  end
end
```

Em `config/routes.rb`, dentro do `scope :api`, abaixo das rotas de ciclo:

```ruby
    get  "debts"           => "debts#index"
    post "debts/reimburse" => "debts#reimburse"
```

- [ ] **Step 4: Rodar e ver passar**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test test/services/debts test/controllers/debts_controller_test.rb`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/debts app/controllers/debts_controller.rb config/routes.rb test/services/debts test/controllers/debts_controller_test.rb
git commit -m "Track what other people owe for purchases on the user's cards"
```

---

### Task 11: Prévia dos próximos ciclos

**Files:**
- Create: `app/services/cycles/projection.rb`, `test/services/cycles/projection_test.rb`
- Modify: `app/controllers/cycles_controller.rb`, `test/controllers/cycles_controller_test.rb`

**Interfaces:**
- Consumes: `EnsurePaymentsForCycle.applies?` (Task 4) e `CycleParam::MAX_AHEAD`.
- Produces:
  - `Cycles::Projection.new(user:, count: 6).call -> [Row(number, own_cards, third_party, fixed_expenses, expected_income)]`, com `Row#balance`.
  - `GET /api/cycles` ganha `upcoming: [{ number, own_cards, third_party, fixed_expenses, expected_income, balance }]`.

- [ ] **Step 1: Escrever os testes**

```ruby
# test/services/cycles/projection_test.rb
require "test_helper"

class Cycles::ProjectionTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(email: "proj@finansheet.local", password: "secret123")
    @card = @user.cards.create!(name: "Nubank", mode: :credit)
    @open = @user.open_cycle
    @open.update!(expected_income: 5000)
  end

  test "sums what is already committed in each of the next cycles" do
    buy(300, count: 3)
    buy(200, count: 2, third_party_name: "Mãe")
    @user.fixed_expenses.create!(name: "Aluguel", amount: 750)
    @user.fixed_expenses.create!(name: "TV", amount: 200, installments_count: 3, installments_paid: 1,
                                 start_cycle_number: @open.number)
    @user.fixed_expenses.create!(name: "Antiga", amount: 99, active: false)

    rows = Cycles::Projection.new(user: @user, count: 3).call

    assert_equal [@open.number + 1, @open.number + 2, @open.number + 3], rows.map(&:number)
    assert_equal 100.to_d,  rows.first.own_cards
    assert_equal 100.to_d,  rows.first.third_party
    assert_equal 950.to_d,  rows.first.fixed_expenses # aluguel + TV 3/3
    assert_equal 5000.to_d, rows.first.expected_income
    assert_equal 3950.to_d, rows.first.balance
    assert_equal 750.to_d,  rows.second.fixed_expenses # TV acabou
    assert_equal 0.to_d,    rows.third.own_cards
  end

  test "is read only" do
    @user.fixed_expenses.create!(name: "Aluguel", amount: 750)

    assert_no_difference("FixedExpensePayment.count") { Cycles::Projection.new(user: @user).call }
  end

  private

  def buy(total, count:, third_party_name: nil)
    form = CardPurchaseForm.new(user: @user, card: @card, description: "X", total_amount: total,
                                installments_count: count, third_party_name:)
    form.save || raise(form.errors.full_messages.inspect)
  end
end
```

Acrescentar em `test/controllers/cycles_controller_test.rb`, antes de `private`:

```ruby
  test "GET index includes the next 6 cycles" do
    get "/api/cycles", headers: @auth, as: :json

    upcoming = JSON.parse(response.body)["upcoming"]
    assert_equal (2..7).to_a, upcoming.map { |row| row["number"] }
  end
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test test/services/cycles/projection_test.rb test/controllers/cycles_controller_test.rb`
Expected: FAIL com `uninitialized constant Cycles::Projection`.

- [ ] **Step 3: Implementar**

```ruby
# app/services/cycles/projection.rb
module Cycles
  # Prévia dos próximos ciclos: o que já está comprometido (parcelas e
  # contas fixas pelo valor cadastrado) e a sobra prevista com a renda do
  # ciclo aberto. Só leitura — não grava nada.
  class Projection
    DEFAULT_COUNT = CycleParam::MAX_AHEAD

    Row = Data.define(:number, :own_cards, :third_party, :fixed_expenses, :expected_income) do
      def balance
        expected_income - own_cards - fixed_expenses
      end
    end

    def initialize(user:, count: DEFAULT_COUNT)
      @user  = user
      @count = count
    end

    def call
      open     = @user.open_cycle
      numbers  = (open.number + 1)..(open.number + @count)
      sums     = installment_sums(numbers)
      expenses = @user.fixed_expenses.active.to_a

      numbers.map do |number|
        Row.new(
          number:,
          own_cards:       sums.fetch([number, false], 0.to_d),
          third_party:     sums.fetch([number, true], 0.to_d),
          fixed_expenses:  expenses.select { |fe| FixedExpenses::EnsurePaymentsForCycle.applies?(fe, number) }
                                   .sum(0.to_d, &:amount),
          expected_income: open.expected_income,
        )
      end
    end

    private

    # { [cycle_number, de_terceiro?] => soma }
    def installment_sums(numbers)
      Installment.joins(:card_purchase)
                 .where(card_purchases: { user_id: @user.id }, cycle_number: numbers)
                 .group(:cycle_number, Arel.sql("card_purchases.third_party_name IS NOT NULL"))
                 .sum(:amount)
    end
  end
end
```

Em `app/controllers/cycles_controller.rb`, no hash do `index`, acrescentar:

```ruby
      upcoming: Cycles::Projection.new(user: current_user).call.map { |row| serialize_projection(row) },
```
e no `private`:

```ruby
  def serialize_projection(row)
    {
      number:          row.number,
      own_cards:       row.own_cards.to_f,
      third_party:     row.third_party.to_f,
      fixed_expenses:  row.fixed_expenses.to_f,
      expected_income: row.expected_income.to_f,
      balance:         row.balance.to_f,
    }
  end
```

- [ ] **Step 4: Rodar e ver passar**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test test/services/cycles test/controllers/cycles_controller_test.rb`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/cycles/projection.rb app/controllers/cycles_controller.rb test/services/cycles/projection_test.rb test/controllers/cycles_controller_test.rb
git commit -m "Projection of the next cycles"
```

---

### Task 12: Finalizar o banco e remover o modelo por mês

**Files:**
- Create: `db/migrate/20261012000003_finalize_cycle_numbering.rb`
- Modify: `db/schema.rb` (gerado), `app/models/user.rb` (sai `next_open_cycle_month`), `test/models/user_test.rb` (saem os 3 testes de `next_open_cycle_month`)

**Interfaces:**
- Produces:
  - **Constraints:** `cycles.number` e `cycles.started_at` NOT NULL; índice único `(user_id, number)`; índice único parcial "um ciclo aberto por usuário"; `installments.cycle_number` e `fixed_expense_payments.cycle_number` NOT NULL; nova check `fixed_expenses_installments_consistency` com `start_cycle_number`.
  - **Remoções:** colunas antigas e a tabela `incomes`.

- [ ] **Step 1: Escrever a migration**

```ruby
# db/migrate/20261012000003_finalize_cycle_numbering.rb
#
# Depois da conversão (20261012000002): aperta as regras novas no banco e
# remove o modelo "ciclo = mês". Irreversível — o backup do Task 0 é a volta.
class FinalizeCycleNumbering < ActiveRecord::Migration[8.1]
  def up
    change_column_null :cycles, :number, false
    change_column_null :cycles, :started_at, false
    add_index :cycles, [:user_id, :number], unique: true
    add_index :cycles, :user_id, unique: true, where: "closed_at IS NULL", name: "index_cycles_one_open_per_user"
    remove_index :cycles, name: "index_cycles_on_user_id_and_reference_month"
    remove_column :cycles, :reference_month
    remove_column :cycles, :total_expenses

    change_column_null :installments, :cycle_number, false
    remove_index :installments, name: "index_installments_on_due_month"
    remove_column :installments, :due_month
    add_index :installments, :cycle_number

    remove_column :card_purchases, :excluded_from_summary

    change_column_null :fixed_expense_payments, :cycle_number, false
    remove_index :fixed_expense_payments, name: "idx_on_fixed_expense_id_reference_month_07ef94a6f1"
    remove_column :fixed_expense_payments, :reference_month
    add_index :fixed_expense_payments, [:fixed_expense_id, :cycle_number], unique: true

    remove_column :fixed_expenses, :start_month
    add_check_constraint :fixed_expenses,
                         "installments_count IS NULL AND start_cycle_number IS NULL OR " \
                         "installments_count IS NOT NULL AND start_cycle_number IS NOT NULL AND " \
                         "installments_paid >= 0 AND installments_paid < installments_count",
                         name: "fixed_expenses_installments_consistency"

    drop_table :incomes
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end
```

- [ ] **Step 2: Rodar no ensaio**

Run: `docker compose run --rm -e POSTGRES_DB=finansheet_ensaio app bin/rails db:migrate`
Expected: `migrated`. Em `git diff db/schema.rb`, somem `reference_month`, `due_month`, `excluded_from_summary`, `start_month`, `total_expenses` e `create_table "incomes"`, e aparecem os índices novos.

- [ ] **Step 3: Remover o que sobrou do modelo por mês**

Em `app/models/user.rb`, apagar o método `next_open_cycle_month` e o comentário acima dele. Em `test/models/user_test.rb`, apagar os três testes `next_open_cycle_month ...`.

Run: `grep -rnE "reference_month|due_month|excluded_from_summary|start_month|next_due_month|next_open_cycle_month|incomes|total_expenses" app/models app/services app/controllers app/forms config test`
Expected: nenhuma linha. Se aparecer alguma, trocar pelo equivalente por ciclo antes de seguir.

- [ ] **Step 4: Suíte completa, lint e segurança**

```bash
docker compose run --rm -e RAILS_ENV=test app bin/rails test
docker compose run --rm app bin/rubocop
docker compose run --rm app bin/brakeman --no-pager
```
Expected: `0 failures, 0 errors`; rubocop sem ofensas (corrigir as que aparecerem nos arquivos deste plano); brakeman sem avisos novos.

- [ ] **Step 5: Commit**

```bash
git add -A db app/models test/models
git commit -m "Finalize numbered cycles and drop month-based columns"
```

---

### Task 13: Tela principal por ciclo

**Files:**
- Modify (reescrever inteiro): `app/javascript/controllers/cards_controller.js`, `app/views/home/index.html.erb`
- Create: `app/assets/stylesheets/cycles.css`
- Modify: `app/assets/stylesheets/application.css` (import), `app/assets/stylesheets/cards.css` (texto do vazio e remoção do estilo do "olho")

**Interfaces:**
- Consumes:
  - `GET /api/cards?cycle=N`, `GET /api/cards/:id/installments?cycle=N` (Task 5);
  - `PUT` e `DELETE /api/cycles/current/cards/:id/check` (Task 8);
  - `GET /api/debts`, campo `known_names` (Task 10).
- Produces (eventos `window`):
  - `cycle:summary-update` com `{ cycleNumber, status, label, expectedIncome, cardLines: [{name, total}], thirdPartyTotal }`;
  - `purchase:menu-request` com `{ cardId, cycleStatus, inst, anchor }`;
  - `purchase:created` (o tour usa).
- Ouve: `purchase:changed { cardId }` e `income:changed { amount }`.

- [ ] **Step 1: Reescrever `app/javascript/controllers/cards_controller.js`**

```js
import { Controller } from "@hotwired/stimulus"

// Página inicial: grid de cartões do ciclo visualizado + CRUD via modal.
// Padrão do projeto: lista vem de fetch após render.
//
// Loading em duas etapas:
//   1) GET /api/cards?cycle=N                  — cabeçalho do ciclo + cartões
//   2) GET /api/cards/:id/installments?cycle=N — por cartão, itens + totais
//
// O ciclo visualizado fica na URL (?cycle=N) pra sobreviver F5. Sem o
// parâmetro, o backend devolve o ciclo aberto e a gente adota.
const ITEMS_PREVIEW = 10

export default class extends Controller {
  static targets = [
    "grid", "loading", "cardTemplate",
    "formModal", "formTitle", "form", "formId", "formSubmit",
    "fieldName", "fieldBank", "fieldMode", "fieldPayDay", "fieldBestDay", "fieldColor",
    "purchaseModal", "purchaseForm", "purchaseSubmit", "purchaseCardId",
    "purchaseCardHeader", "purchaseCardName", "purchaseCardBank", "purchaseCardMeta",
    "purchaseFieldDescription", "purchaseFieldTotal", "purchaseFieldInstallments",
    "purchaseFieldHasPaid", "purchaseFieldPaidWrapper", "purchaseFieldPaidCount",
    "purchaseFieldDate", "purchaseFieldThirdParty", "thirdPartyNames",
    "purchasePreview",
    "cycleLabel", "prevButton", "nextButton", "statusTag", "turnButton", "turnLabel",
    "notice", "noticeText",
  ]

  connect() {
    this.cards = []
    this.installmentsByCard = {}
    this.expanded = new Set()
    this.cycleNumber = readCycleFromURL()
    this.cycle = null

    // Os modais de editar/remover compra, o menu da compra e o de income
    // moram em controllers próprios. Aqui só ouvimos o que eles avisam.
    this.onPurchaseChanged = (event) => {
      const cardId = event.detail?.cardId
      if (cardId) this.loadInstallments(cardId)
    }
    this.onIncomeChanged = (event) => {
      if (!this.isOpen) return
      this.cycle.expected_income = Number(event.detail?.amount ?? 0)
      this.emitSummaryUpdate()
    }
    window.addEventListener("purchase:changed", this.onPurchaseChanged)
    window.addEventListener("income:changed",   this.onIncomeChanged)

    this.loadCards()
  }

  disconnect() {
    window.removeEventListener("purchase:changed", this.onPurchaseChanged)
    window.removeEventListener("income:changed",   this.onIncomeChanged)
  }

  get isOpen() {
    return this.cycle?.status === "open"
  }

  // ---- API: cartões + cabeçalho do ciclo ----

  async loadCards({ withFade = false } = {}) {
    if (withFade) this.gridTarget.classList.add("cards-grid--fading")
    else this.showLoading()

    try {
      const url = this.cycleNumber ? `/api/cards?cycle=${this.cycleNumber}` : `/api/cards`
      const resp = await this.authFetch(url)
      if (!resp.ok) throw new Error(`GET /api/cards falhou: ${resp.status}`)
      const data = await resp.json()
      // O backend corrige número ausente/fora do intervalo; adotamos o dele.
      this.cycle = data.cycle
      this.cycleNumber = data.cycle.number
      writeCycleToURL(this.cycleNumber)
      this.cards = data.cards ?? []
      this.installmentsByCard = {}
      this.expanded.clear()
      this.render()
      this.renderCycleNav()
      this.emitSummaryUpdate()
      this.cards.forEach((c) => this.loadInstallments(c.id))
    } catch (err) {
      console.error("[cards] load failed", err)
      this.gridTarget.innerHTML = `<div class="cards-grid__empty">Erro carregando cartões.</div>`
    } finally {
      this.gridTarget.classList.remove("cards-grid--fading")
    }
  }

  // ---- API: parcelas por cartão ----

  async loadInstallments(cardId) {
    const cardEl = this.findCardEl(cardId)
    if (!cardEl) return

    cardEl.classList.add("card-item--loading-items")
    try {
      const resp = await this.authFetch(`/api/cards/${cardId}/installments?cycle=${this.cycleNumber}`)
      if (!resp.ok) throw new Error(`GET installments falhou: ${resp.status}`)
      const data = await resp.json()
      this.installmentsByCard[cardId] = data
      this.applyInstallments(cardEl, data)
    } catch (err) {
      console.error(`[cards] installments load failed for ${cardId}`, err)
      cardEl.querySelector("[data-items]").innerHTML = `<li style="opacity:0.7;font-style:italic;">Erro carregando lançamentos</li>`
    } finally {
      cardEl.classList.remove("card-item--loading-items")
    }
  }

  applyInstallments(cardEl, data) {
    const cardId  = cardEl.dataset.cardId
    const all     = data.installments ?? []
    const showAll = this.expanded.has(cardId)
    const visible = showAll ? all : all.slice(0, ITEMS_PREVIEW)

    const itemsEl = cardEl.querySelector("[data-items]")
    itemsEl.innerHTML = ""
    for (const inst of visible) itemsEl.appendChild(this.buildItemRow(inst, cardId))

    const moreEl = cardEl.querySelector("[data-more]")
    if (all.length > ITEMS_PREVIEW) {
      moreEl.textContent = showAll ? "Ver menos" : `Ver todas (+${all.length - ITEMS_PREVIEW})`
      moreEl.hidden = false
    } else {
      moreEl.hidden = true
    }

    cardEl.querySelector("[data-cycle-total]").textContent  = formatBRL(data.cycle_total ?? 0)
    cardEl.querySelector("[data-future-total]").textContent = formatBRL(data.future_total ?? 0)

    // A sobra depende do total de cada cartão; reemite a cada chegada.
    this.emitSummaryUpdate()
  }

  toggleMore(event) {
    const cardEl = event.currentTarget.closest(".card-item")
    const id = cardEl.dataset.cardId
    if (this.expanded.has(id)) this.expanded.delete(id)
    else this.expanded.add(id)

    const data = this.installmentsByCard[id]
    if (data) this.applyInstallments(cardEl, data)
  }

  buildItemRow(inst, cardId) {
    const li = document.createElement("li")
    if (inst.third_party_name) li.classList.add("card-item__items-row--third-party")

    const fraction = inst.installments_count === 1 ? "x1" : `${inst.number}/${inst.installments_count}`
    const tags = []
    if (inst.third_party_name) tags.push(`<span class="item-tag item-tag--person">${escapeHtml(inst.third_party_name)}</span>`)
    if (inst.prepaid)          tags.push(`<span class="item-tag">quitada</span>`)
    if (inst.cancelled)        tags.push(`<span class="item-tag">cancelada</span>`)

    const label = document.createElement("span")
    label.className = "card-item__item-label"
    label.innerHTML = `${escapeHtml(inst.description)}<span class="card-item__item-installment">${fraction}</span>${tags.join("")}`
    li.appendChild(label)

    const amount = document.createElement("span")
    amount.className = "card-item__item-amount"
    amount.textContent = formatBRL(inst.amount)
    li.appendChild(amount)

    // Um botão "⋯" por compra; quem monta o menu é o purchase_menu_controller.
    const menuBtn = document.createElement("button")
    menuBtn.type = "button"
    menuBtn.className = "card-item__item-action"
    menuBtn.title = "Ações da compra"
    menuBtn.setAttribute("aria-label", "Ações da compra")
    menuBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${DOTS_PATH}</svg>`
    menuBtn.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("purchase:menu-request", {
        detail: { cardId, cycleStatus: this.cycle?.status, inst, anchor: menuBtn },
      }))
    })

    const actions = document.createElement("span")
    actions.className = "card-item__item-actions"
    actions.appendChild(menuBtn)
    li.appendChild(actions)

    return li
  }

  // ---- Navegação entre ciclos (URL state) ----

  prevCycle() {
    if (!this.canGoBack()) return
    this.cycleNumber -= 1
    this.loadCards({ withFade: true })
  }

  nextCycle() {
    if (!this.canGoForward()) return
    this.cycleNumber += 1
    this.loadCards({ withFade: true })
  }

  canGoBack() {
    return !!this.cycle && this.cycle.number > (this.cycle.first_number ?? this.cycle.number)
  }

  canGoForward() {
    return !!this.cycle && this.cycle.number < this.cycle.max_number
  }

  renderCycleNav() {
    this.cycleLabelTarget.textContent = cycleTitle(this.cycle)
    this.prevButtonTarget.disabled = !this.canGoBack()
    this.nextButtonTarget.disabled = !this.canGoForward()

    const tag = { closed: "Fechado", upcoming: "Prévia" }[this.cycle.status]
    this.statusTagTarget.textContent = tag ?? ""
    this.statusTagTarget.hidden = !tag

    this.turnLabelTarget.textContent = this.isOpen ? "Virar ciclo" : "Voltar ao ciclo aberto"
  }

  // No ciclo aberto, vai para a tela de virada; nos outros, volta ao aberto.
  turnOrBack() {
    if (this.isOpen) {
      window.location.href = "/dashboard/virada"
      return
    }
    this.cycleNumber = this.cycle.open_number
    this.loadCards({ withFade: true })
  }

  // ---- Conferido ✓ ----

  async toggleCheck(event) {
    const btn = event.currentTarget
    const cardEl = btn.closest(".card-item")
    const card = this.cards.find((c) => c.id === cardEl.dataset.cardId)
    if (!card || !this.isOpen || btn.disabled) return

    btn.disabled = true
    try {
      const resp = await this.authFetch(`/api/cycles/current/cards/${card.id}/check`, {
        method: card.checked ? "DELETE" : "PUT",
      })
      if (!resp.ok) throw new Error(`check falhou: ${resp.status}`)
      card.checked = !card.checked
    } catch (err) {
      console.error("[cards] check failed", err)
      alert("Erro ao marcar o cartão.")
    } finally {
      this.applyCheck(cardEl, card)
    }
  }

  applyCheck(cardEl, card) {
    const btn = cardEl.querySelector("[data-check]")
    btn.hidden = !this.isOpen && !card.checked
    btn.disabled = !this.isOpen
    btn.classList.toggle("card-item__check--on", !!card.checked)
    btn.textContent = card.checked ? "Conferido ✓" : "Marcar conferido"
  }

  // ---- Resumo do ciclo (sidebar) ----

  // Emite "cycle:summary-update" pro cycle_summary_controller (sidebar) e
  // pro fixed_expenses_summary_controller. "Seus cartões" usa só as compras
  // do usuário; as de outras pessoas vão numa linha informativa.
  emitSummaryUpdate() {
    if (!this.cycle) return

    const cardLines = this.cards
      .map((c) => ({ name: c.name, total: Number(this.installmentsByCard[c.id]?.cycle_total_own ?? 0) }))
      .filter((l) => l.total > 0)

    const thirdPartyTotal = this.cards.reduce((sum, c) => {
      const data = this.installmentsByCard[c.id]
      return sum + Number(data?.cycle_total ?? 0) - Number(data?.cycle_total_own ?? 0)
    }, 0)

    window.dispatchEvent(new CustomEvent("cycle:summary-update", {
      detail: {
        cycleNumber:    this.cycle.number,
        status:         this.cycle.status,
        label:          cycleTitle(this.cycle),
        expectedIncome: this.cycle.expected_income,
        cardLines,
        thirdPartyTotal,
      },
    }))
  }

  // ---- CRUD do cartão (modal create/edit) ----

  async submitForm(event) {
    event.preventDefault()
    const id = this.formIdTarget.value
    const payload = {
      name:     this.fieldNameTarget.value.trim(),
      bank:     this.fieldBankTarget.value.trim(),
      mode:     this.fieldModeTarget.value,
      pay_day:  this.parseDay(this.fieldPayDayTarget.value),
      best_day: this.parseDay(this.fieldBestDayTarget.value),
      color:    this.fieldColorTarget.value,
    }

    this.setSubmitting(true)
    try {
      const url = id ? `/api/cards/${id}` : `/api/cards`
      const resp = await this.authFetch(url, {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card: payload }),
      })

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        alert((data.errors || ["Erro ao salvar"]).join(", "))
        return
      }

      this.closeForm()
      await this.loadCards()
      // Sinaliza criação (não edição) — o tour de onboarding avança.
      if (!id) window.dispatchEvent(new CustomEvent("card:created"))
    } catch (err) {
      console.error("[cards] submit failed", err)
      alert("Erro ao salvar o cartão.")
    } finally {
      this.setSubmitting(false)
    }
  }

  async remove(event) {
    const cardEl = event.currentTarget.closest(".card-item")
    const card = this.cards.find((c) => c.id === cardEl.dataset.cardId)
    if (!card) return
    if (!confirm(`Remover o cartão "${card.name}"?`)) return

    try {
      const resp = await this.authFetch(`/api/cards/${card.id}`, { method: "DELETE" })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        alert((data.errors || ["Erro ao remover"]).join(", "))
        return
      }
      await this.loadCards()
    } catch (err) {
      console.error("[cards] delete failed", err)
      alert("Erro ao remover o cartão.")
    }
  }

  openCreate() {
    this.resetForm()
    this.formTitleTarget.textContent = "Novo cartão"
    this.formModalTarget.showModal()
    this.fieldNameTarget.focus()
  }

  openEdit(event) {
    const card = this.cards.find((c) => c.id === event.currentTarget.closest(".card-item").dataset.cardId)
    if (!card) return

    this.formIdTarget.value       = card.id
    this.fieldNameTarget.value    = card.name ?? ""
    this.fieldBankTarget.value    = card.bank ?? ""
    this.fieldModeTarget.value    = card.mode ?? "credit"
    this.fieldPayDayTarget.value  = card.pay_day ?? ""
    this.fieldBestDayTarget.value = card.best_day ?? ""
    this.fieldColorTarget.value   = card.color ?? "#1d4ed8"

    this.formTitleTarget.textContent = "Editar cartão"
    this.formModalTarget.showModal()
    this.fieldNameTarget.focus()
  }

  closeForm() {
    this.formModalTarget.close()
  }

  // ---- Modal: lançar compra ----

  openPurchase(event) {
    if (!this.isOpen) return
    const card = this.cards.find((c) => c.id === event.currentTarget.closest(".card-item").dataset.cardId)
    if (!card) return

    this.purchaseFormTarget.reset()
    this.purchaseCardIdTarget.value = card.id
    this.purchaseCardNameTarget.textContent = card.name || "—"
    this.purchaseCardBankTarget.textContent = card.bank || ""
    this.purchaseCardMetaTarget.textContent = cardMeta(card)

    this.purchaseCardHeaderTarget.classList.remove("modal-purchase__card--credit", "modal-purchase__card--debit")
    this.purchaseCardHeaderTarget.classList.add(card.mode === "debit" ? "modal-purchase__card--debit" : "modal-purchase__card--credit")
    this.purchaseCardHeaderTarget.style.background = card.color || ""

    this.purchaseFieldDateTarget.value = todayISO()
    this.purchaseFieldInstallmentsTarget.value = "1"
    this.purchaseFieldHasPaidTarget.checked = false
    this.purchaseFieldPaidWrapperTarget.hidden = true
    this.purchaseFieldPaidCountTarget.value = ""
    this.purchaseFieldThirdPartyTarget.value = ""

    this.updatePurchasePreview()
    this.purchaseModalTarget.showModal()
    this.purchaseFieldDescriptionTarget.focus()
    this.loadKnownNames()
  }

  // Sugestões de "de outra pessoa" (nomes já usados).
  async loadKnownNames() {
    try {
      const resp = await this.authFetch("/api/debts")
      if (!resp.ok) return
      const data = await resp.json()
      this.thirdPartyNamesTarget.innerHTML = (data.known_names ?? [])
        .map((name) => `<option value="${escapeHtml(name)}"></option>`)
        .join("")
    } catch (err) {
      console.error("[cards] known names failed", err)
    }
  }

  togglePurchasePaid() {
    const on = this.purchaseFieldHasPaidTarget.checked
    this.purchaseFieldPaidWrapperTarget.hidden = !on
    if (on) this.purchaseFieldPaidCountTarget.focus()
    else this.purchaseFieldPaidCountTarget.value = ""
    this.updatePurchasePreview()
  }

  closePurchase() {
    this.purchaseModalTarget.close()
  }

  // A próxima parcela em aberto sempre cai no ciclo aberto; as seguintes,
  // um ciclo depois da outra.
  updatePurchasePreview() {
    const total   = parseFloat(this.purchaseFieldTotalTarget.value)
    const count   = parseInt(this.purchaseFieldInstallmentsTarget.value, 10)
    const hasPaid = this.purchaseFieldHasPaidTarget.checked
    const paid    = hasPaid ? parseInt(this.purchaseFieldPaidCountTarget.value, 10) : 0

    if (!total || !count || count < 1) {
      this.purchasePreviewTarget.hidden = true
      return
    }

    if (hasPaid && (!Number.isFinite(paid) || paid < 1 || paid >= count)) {
      this.purchasePreviewTarget.innerHTML = `<strong style="color:#b91c1c">Parcelas pagas deve ser entre 1 e ${count - 1}.</strong>`
      this.purchasePreviewTarget.hidden = false
      return
    }

    const base      = Math.floor((total / count) * 100) / 100
    const last      = Math.round((total - base * (count - 1)) * 100) / 100
    const remaining = count - paid

    let splitTxt
    if (remaining === 1)    splitTxt = `1× ${formatBRL(last)}`
    else if (base === last) splitTxt = `${remaining}× ${formatBRL(base)}`
    else                    splitTxt = `${remaining - 1}× ${formatBRL(base)} + 1× ${formatBRL(last)}`

    const startTxt = paid > 0 ? `começa na ${paid + 1}ª/${count} neste ciclo` : "primeira neste ciclo"
    const endTxt   = remaining > 1 ? `, última daqui a ${remaining - 1} ciclo(s)` : ""

    this.purchasePreviewTarget.innerHTML = `<strong>${splitTxt}</strong> — ${startTxt}${endTxt}`
    this.purchasePreviewTarget.hidden = false
  }

  async submitPurchase(event) {
    event.preventDefault()

    const cardId = this.purchaseCardIdTarget.value
    const installmentsCount = parseInt(this.purchaseFieldInstallmentsTarget.value, 10)
    const hasPaid = this.purchaseFieldHasPaidTarget.checked
    const installmentsPaid = hasPaid ? parseInt(this.purchaseFieldPaidCountTarget.value, 10) : 0

    if (hasPaid && (!Number.isFinite(installmentsPaid) || installmentsPaid < 1 || installmentsPaid >= installmentsCount)) {
      alert(`Parcelas já pagas deve ser entre 1 e ${installmentsCount - 1}.`)
      return
    }

    const payload = {
      description:        this.purchaseFieldDescriptionTarget.value.trim(),
      total_amount:       parseFloat(this.purchaseFieldTotalTarget.value),
      installments_count: installmentsCount,
      installments_paid:  installmentsPaid,
      purchased_on:       this.purchaseFieldDateTarget.value || null,
      third_party_name:   this.purchaseFieldThirdPartyTarget.value.trim() || null,
    }

    this.setPurchaseSubmitting(true)
    try {
      const resp = await this.authFetch(`/api/cards/${cardId}/purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchase: payload }),
      })

      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        alert((data.errors || ["Erro ao lançar compra"]).join(", "))
        return
      }

      this.closePurchase()
      await this.loadInstallments(cardId)
      this.showNotice({ text: "Lançamento criado.", autoHideMs: 3500 })
      if (payload.third_party_name) window.dispatchEvent(new CustomEvent("debts:changed"))

      // Só em criação (não em edição/remoção) — o tour de onboarding ouve.
      window.dispatchEvent(new CustomEvent("purchase:created", {
        detail: { cardId, purchaseId: data.purchase?.id },
      }))
    } catch (err) {
      console.error("[cards] purchase failed", err)
      alert("Erro ao lançar a compra.")
    } finally {
      this.setPurchaseSubmitting(false)
    }
  }

  setPurchaseSubmitting(flag) {
    this.purchaseSubmitTarget.disabled = flag
    this.purchaseSubmitTarget.innerHTML = flag ? `<span class="spinner"></span> Lançando…` : `Lançar`
  }

  // ---- Notice (toast inline) ----

  showNotice({ text, autoHideMs = null }) {
    if (this.noticeHideTimer) clearTimeout(this.noticeHideTimer)
    this.noticeTextTarget.textContent = text
    this.noticeTarget.hidden = false
    if (autoHideMs) this.noticeHideTimer = setTimeout(() => this.dismissNotice(), autoHideMs)
  }

  dismissNotice() {
    if (this.noticeHideTimer) clearTimeout(this.noticeHideTimer)
    this.noticeTarget.hidden = true
  }

  // ---- Render ----

  render() {
    this.gridTarget.innerHTML = ""

    if (this.cards.length === 0) {
      const placeholder = document.createElement("button")
      placeholder.type = "button"
      placeholder.className = "card-item card-item--add"
      placeholder.innerHTML = `<span class="card-item--add__icon">+</span><span class="card-item--add__label">Cadastre seu primeiro cartão</span>`
      placeholder.addEventListener("click", () => this.openCreate())
      this.gridTarget.appendChild(placeholder)
      return
    }

    for (const card of this.cards) this.gridTarget.appendChild(this.buildCardEl(card))
  }

  buildCardEl(card) {
    const node = this.cardTemplateTarget.content.firstElementChild.cloneNode(true)
    node.dataset.cardId = card.id
    node.classList.add(card.mode === "debit" ? "card-item--debit" : "card-item--credit")
    if (card.color) node.style.background = card.color

    node.querySelector("[data-name]").textContent     = card.name || "—"
    node.querySelector("[data-bank]").textContent     = card.bank || ""
    node.querySelector("[data-mode]").textContent     = card.mode === "debit" ? "Débito" : "Crédito"
    node.querySelector("[data-pay-day]").textContent  = card.pay_day  ?? "—"
    node.querySelector("[data-best-day]").textContent = card.best_day ?? "—"

    // Itens e totais chegam em loadInstallments(cardId).
    node.querySelector("[data-items]").innerHTML = `<li style="opacity:0.5;font-style:italic;">Carregando…</li>`
    node.querySelector("[data-cycle-total]").textContent  = "—"
    node.querySelector("[data-future-total]").textContent = "—"
    this.applyCheck(node, card)

    if (!this.isOpen) {
      const text = this.cycle?.status === "closed" ? POPOVER_CLOSED_TEXT : POPOVER_UPCOMING_TEXT
      node.querySelectorAll(".card-item__actions button").forEach((btn) => {
        btn.disabled = true
        btn.dataset.controller = "popover"
        btn.dataset.popoverTextValue = text
      })
    }

    return node
  }

  showLoading() {
    this.gridTarget.innerHTML = `<div class="cards-grid__loading"><span class="spinner"></span> Carregando cartões…</div>`
  }

  findCardEl(cardId) {
    return this.gridTarget.querySelector(`.card-item[data-card-id="${cardId}"]`)
  }

  // ---- Helpers ----

  resetForm() {
    this.formTarget.reset()
    this.formIdTarget.value = ""
    this.fieldModeTarget.value = "credit"
    this.fieldColorTarget.value = "#1d4ed8"
  }

  parseDay(value) {
    const n = parseInt(value, 10)
    return Number.isFinite(n) && n >= 1 && n <= 31 ? n : null
  }

  setSubmitting(flag) {
    this.formSubmitTarget.disabled = flag
    this.formSubmitTarget.innerHTML = flag ? `<span class="spinner"></span> Salvando…` : `Salvar`
  }

  authFetch(url, options = {}) {
    const token = localStorage.getItem("auth_token")
    const headers = {
      "Accept": "application/json",
      ...(options.headers ?? {}),
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    }
    return fetch(url, { ...options, headers })
  }
}

const POPOVER_CLOSED_TEXT   = "Ciclo fechado — não é possível alterar lançamentos."
const POPOVER_UPCOMING_TEXT = "Prévia de um ciclo futuro — lance compras no ciclo aberto."

const DOTS_PATH = `<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>`

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

function formatBRL(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return "R$ 0,00"
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// "12/out"
function formatShortDate(iso) {
  if (!iso) return "—"
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, "0")}/${MONTHS[d.getMonth()]}`
}

// Título da barra de navegação para o ciclo visualizado.
function cycleTitle(cycle) {
  if (cycle.status === "open")   return `Ciclo aberto · desde ${formatShortDate(cycle.started_at)}`
  if (cycle.status === "closed") return `${formatShortDate(cycle.started_at)} → ${formatShortDate(cycle.closed_at)}`
  const ahead = cycle.number - cycle.open_number
  return ahead === 1 ? "Próximo ciclo (prévia)" : `Daqui a ${ahead} ciclos (prévia)`
}

function cardMeta(card) {
  return `Fecha dia ${card.best_day ?? "—"} · vence dia ${card.pay_day ?? "—"}`
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function readCycleFromURL() {
  const n = parseInt(new URLSearchParams(window.location.search).get("cycle"), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function writeCycleToURL(number) {
  const url = new URL(window.location.href)
  url.searchParams.set("cycle", String(number))
  url.searchParams.delete("month")
  window.history.replaceState({}, "", url)
}
```

- [ ] **Step 2: Reescrever `app/views/home/index.html.erb`**

```erb
<% content_for :title, "FinanSheet — Cartões" %>

<section class="cards-page" data-controller="cards">
  <%# Wrapper genérico: vira sticky no mobile (ver .page-sticky-top no cards.css). %>
  <div class="page-sticky-top">
    <header class="cards-page__header">
      <h1 class="cards-page__title">Cartões</h1>
      <button type="button" class="action-btn action-btn--primary" data-action="cards#openCreate">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        <span>Novo cartão</span>
      </button>
    </header>

    <nav class="month-nav">
      <button type="button" class="month-nav__nav" data-action="cards#prevCycle"
              data-cards-target="prevButton" aria-label="Ciclo anterior" title="Ciclo anterior">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>

      <div class="month-nav__center">
        <span class="month-nav__label" data-cards-target="cycleLabel">—</span>
        <span class="month-nav__closed-tag" data-cards-target="statusTag" hidden></span>
      </div>

      <button type="button" class="month-nav__nav" data-action="cards#nextCycle"
              data-cards-target="nextButton" aria-label="Próximo ciclo" title="Próximo ciclo">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>

      <button type="button" class="action-btn action-btn--success" data-action="cards#turnOrBack"
              data-cards-target="turnButton">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15A9 9 0 1 1 18 6.36L23 10"/>
        </svg>
        <span data-cards-target="turnLabel">Virar ciclo</span>
      </button>
    </nav>
  </div><%# /.page-sticky-top %>

  <div class="page-notice" data-cards-target="notice" hidden>
    <span data-cards-target="noticeText"></span>
    <button type="button" class="page-notice__close" data-action="cards#dismissNotice" aria-label="Fechar">×</button>
  </div>

  <div class="cards-grid" data-cards-target="grid">
    <div class="cards-grid__loading" data-cards-target="loading">
      <span class="spinner"></span> Carregando cartões…
    </div>
  </div>

  <%# Template usado pra renderizar cada cartão (clonado via JS) %>
  <template data-cards-target="cardTemplate">
    <article class="card-item" data-card-id>
      <div class="card-item__top">
        <div>
          <div class="card-item__name" data-name></div>
          <div class="card-item__bank" data-bank></div>
        </div>
        <span class="card-item__mode-tag" data-mode></span>
      </div>

      <button type="button" class="card-item__check" data-check data-action="cards#toggleCheck" hidden>Marcar conferido</button>

      <ul class="card-item__items" data-items></ul>
      <button type="button" class="card-item__more" data-more data-action="cards#toggleMore" hidden></button>

      <div class="card-item__totals">
        <div>
          Neste ciclo
          <span class="card-item__total-value" data-cycle-total>R$ 0,00</span>
        </div>
        <div>
          Parcelas futuras
          <span class="card-item__total-value" data-future-total>R$ 0,00</span>
        </div>
      </div>

      <div class="card-item__days">
        <div>
          Vence dia
          <span class="card-item__day-value" data-pay-day>—</span>
        </div>
        <div>
          Fecha dia
          <span class="card-item__day-value" data-best-day>—</span>
        </div>
      </div>

      <div class="card-item__actions">
        <button type="button" class="card-item__action card-item__action--primary" data-action="cards#openPurchase">Lançar compra</button>
        <button type="button" class="card-item__action" data-action="cards#openEdit">Editar</button>
        <button type="button" class="card-item__action" data-action="cards#remove">Remover</button>
      </div>
    </article>
  </template>

  <%# Modal de criar/editar cartão %>
  <dialog class="modal" data-cards-target="formModal">
    <header class="modal__header">
      <h2 class="modal__title" data-cards-target="formTitle">Novo cartão</h2>
      <button type="button" class="modal__close" data-action="cards#closeForm" aria-label="Fechar">×</button>
    </header>
    <form class="modal__body" data-cards-target="form" data-action="submit->cards#submitForm">
      <input type="hidden" data-cards-target="formId">

      <label class="form-field">
        Nome do cartão
        <input type="text" name="name" placeholder="Ex.: Nubank Platinum" required data-cards-target="fieldName">
      </label>

      <label class="form-field">
        Banco
        <input type="text" name="bank" placeholder="Ex.: Nubank" data-cards-target="fieldBank">
      </label>

      <label class="form-field">
        Cor do cartão
        <input type="color" name="color" value="#1d4ed8" data-cards-target="fieldColor">
      </label>

      <label class="form-field">
        Tipo
        <select name="mode" required data-cards-target="fieldMode">
          <option value="credit">Crédito</option>
          <option value="debit">Débito</option>
        </select>
      </label>

      <div class="form-row">
        <label class="form-field">
          Vence dia <span style="opacity:0.6;font-weight:400">(opcional)</span>
          <input type="number" name="pay_day" min="1" max="31" data-cards-target="fieldPayDay">
        </label>
        <label class="form-field">
          Fecha dia <span style="opacity:0.6;font-weight:400">(opcional)</span>
          <input type="number" name="best_day" min="1" max="31" data-cards-target="fieldBestDay">
        </label>
      </div>

      <div class="modal__footer" style="margin: 1rem -1.25rem -1.25rem; padding: 1rem 1.25rem;">
        <button type="button" class="btn btn--ghost" data-action="cards#closeForm">Cancelar</button>
        <button type="submit" class="btn btn--primary" data-cards-target="formSubmit">Salvar</button>
      </div>
    </form>
  </dialog>

  <%# Modal de lançar compra (com mini-cartão no topo) %>
  <dialog class="modal modal--purchase" data-cards-target="purchaseModal">
    <header class="modal-purchase__card" data-cards-target="purchaseCardHeader">
      <div class="modal-purchase__card-top">
        <div>
          <div class="modal-purchase__card-name" data-cards-target="purchaseCardName"></div>
          <div class="modal-purchase__card-bank" data-cards-target="purchaseCardBank"></div>
        </div>
        <button type="button" class="modal-purchase__card-close" data-action="cards#closePurchase" aria-label="Fechar">×</button>
      </div>
      <div class="modal-purchase__card-meta" data-cards-target="purchaseCardMeta"></div>
    </header>

    <form class="modal__body" data-cards-target="purchaseForm" data-action="submit->cards#submitPurchase">
      <input type="hidden" data-cards-target="purchaseCardId">

      <label class="form-field">
        Descrição
        <input type="text" name="description" placeholder="Ex.: Celular novo" required data-cards-target="purchaseFieldDescription">
      </label>

      <div class="form-row">
        <label class="form-field">
          Valor total (R$)
          <input type="number" step="0.01" min="0.01" name="total_amount" required data-cards-target="purchaseFieldTotal" data-action="input->cards#updatePurchasePreview">
        </label>
        <label class="form-field">
          Parcelas
          <input type="number" min="1" max="48" value="1" name="installments_count" required data-cards-target="purchaseFieldInstallments" data-action="input->cards#updatePurchasePreview">
        </label>
      </div>

      <label class="form-field form-field--inline">
        <input type="checkbox" data-cards-target="purchaseFieldHasPaid" data-action="change->cards#togglePurchasePaid">
        Já paguei algumas parcelas dessa compra
        <span class="form-field__hint" data-controller="popover" data-popover-text-value="Marque se você já pagou parcelas antes de cadastrar. O sistema cadastra só as que faltam, começando pela próxima (ex.: 5ª/6) neste ciclo. O valor total e a quantidade de parcelas continuam sendo da compra inteira.">ⓘ</span>
      </label>

      <label class="form-field" data-cards-target="purchaseFieldPaidWrapper" hidden>
        Quantas parcelas já paguei?
        <input type="number" min="1" max="48" data-cards-target="purchaseFieldPaidCount" data-action="input->cards#updatePurchasePreview">
      </label>

      <label class="form-field">
        De outra pessoa? <span style="opacity:0.6;font-weight:400">(nome; vazio se a compra é sua)</span>
        <input type="text" list="third-party-names" placeholder="Ex.: Mãe" data-cards-target="purchaseFieldThirdParty">
        <datalist id="third-party-names" data-cards-target="thirdPartyNames"></datalist>
      </label>

      <label class="form-field">
        Data da compra <span style="opacity:0.6;font-weight:400">(só para registro)</span>
        <input type="date" data-cards-target="purchaseFieldDate">
      </label>

      <div class="modal-purchase__preview" data-cards-target="purchasePreview" hidden></div>

      <div class="modal__footer" style="margin: 1rem -1.25rem -1.25rem; padding: 1rem 1.25rem;">
        <button type="button" class="btn btn--ghost" data-action="cards#closePurchase">Cancelar</button>
        <button type="submit" class="btn btn--primary" data-cards-target="purchaseSubmit">Lançar</button>
      </div>
    </form>
  </dialog>

  <%# Modais independentes de editar/remover compra (ouvem eventos disparados aqui) %>
  <%= render "shared/purchase_edit_modal" %>
  <%= render "shared/purchase_remove_modal" %>
</section>
```

- [ ] **Step 3: Estilos**

Criar `app/assets/stylesheets/cycles.css`:

```css
/*
 * Ciclo por virada: conferido e etiquetas no cartão, menu da compra,
 * "Me devem", navegação da sidebar, tela de virada e página de ciclos.
 */

/* ===== Cartão ===== */

.card-item__check {
  align-self: flex-start;
  margin: 0.5rem 0 0.2rem;
  border: 1px solid rgba(255, 255, 255, 0.4);
  background: transparent;
  color: inherit;
  border-radius: 999px;
  padding: 0.2rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}
.card-item__check--on {
  background: rgba(255, 255, 255, 0.92);
  border-color: transparent;
  color: #166534;
}
.card-item__check[disabled] { cursor: default; }

.item-tag {
  display: inline-block;
  margin-left: 0.35rem;
  padding: 0 0.4rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  font-size: 0.68rem;
  font-weight: 600;
  vertical-align: middle;
}
.item-tag--person { background: rgba(255, 255, 255, 0.9); color: #0f172a; }

.card-item__items li.card-item__items-row--third-party .card-item__item-amount { opacity: 0.75; }

button.card-item__more {
  background: none;
  border: none;
  color: inherit;
  padding: 0;
  text-align: left;
  text-decoration: underline;
  cursor: pointer;
}

/* ===== Menu da compra ===== */

.purchase-menu {
  position: fixed;
  z-index: 60;
  min-width: 200px;
  padding: 0.3rem;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  color: #0f172a;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
}
.purchase-menu[hidden] { display: none; }
.purchase-menu__item {
  text-align: left;
  background: none;
  border: none;
  padding: 0.5rem 0.7rem;
  border-radius: 6px;
  font: inherit;
  font-size: 0.88rem;
  color: inherit;
  cursor: pointer;
}
.purchase-menu__item:hover { background: #f1f5f9; }
.purchase-menu__item--danger { color: #b91c1c; }

/* ===== Sidebar: navegação, linha informativa e "Me devem" ===== */

.sidebar-nav { display: flex; flex-direction: column; gap: 0.2rem; }
.sidebar-nav__link {
  display: block;
  padding: 0.45rem 0.6rem;
  border-radius: 6px;
  color: var(--sidebar-fg);
  text-decoration: none;
  font-size: 0.9rem;
}
.sidebar-nav__link:hover { background: rgba(255, 255, 255, 0.06); }
.sidebar-nav__link[aria-current="page"] { background: rgba(37, 99, 235, 0.28); }

.sidebar-cycle__line--info { opacity: 0.75; font-style: italic; }

.sidebar-debts__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
.sidebar-debts__toggle {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  background: none;
  border: none;
  padding: 0.2rem 0;
  color: var(--sidebar-fg);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
.sidebar-debts__items ul { list-style: none; margin: 0.3rem 0; padding: 0 0 0 0.5rem; font-size: 0.78rem; color: var(--sidebar-muted); }
.sidebar-debts__items li { display: flex; gap: 0.4rem; align-items: center; padding: 0.15rem 0; }
.sidebar-debts__items li span:first-child { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sidebar-debts__items button,
.sidebar-debts__all {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--sidebar-border);
  color: var(--sidebar-fg);
  border-radius: 5px;
  font-size: 0.72rem;
  padding: 0.1rem 0.45rem;
  cursor: pointer;
}

/* ===== Tela de virada ===== */

.turn-page { max-width: 760px; }
.turn-page__period { color: #475569; margin: -0.5rem 0 1rem; }
.turn-page__banner {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
}
.turn-page__banner--done { background: #f0fdf4; border-color: #bbf7d0; }
.turn-page__banner[hidden] { display: none; }

.turn-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1rem; }
.turn-step { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 1rem 1.1rem; }
.turn-step[hidden] { display: none; }
.turn-step__title { margin: 0 0 0.75rem; font-size: 1rem; display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
.turn-step__shortcut { background: none; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0.2rem 0.6rem; font: inherit; font-size: 0.8rem; cursor: pointer; }
.turn-step__income { display: flex; gap: 0.75rem; align-items: flex-end; flex-wrap: wrap; }

.turn-list { list-style: none; margin: 0; padding: 0; }
.turn-list__row { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; padding: 0.55rem 0; border-bottom: 1px solid #f1f5f9; }
.turn-list__row:last-child { border-bottom: none; }
.turn-list__row--done { opacity: 0.65; }
.turn-list__check { display: flex; gap: 0.6rem; align-items: flex-start; cursor: pointer; flex: 1; min-width: 0; }
.turn-list__check input { margin-top: 0.2rem; width: 18px; height: 18px; flex-shrink: 0; }
.turn-list__check small { display: block; color: #64748b; font-size: 0.78rem; }
.turn-list__amount { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
.turn-list__amount-input { width: 7.5rem; text-align: right; padding: 0.3rem 0.4rem; border: 1px solid #cbd5e1; border-radius: 6px; font: inherit; }
.turn-list__empty { color: #64748b; font-style: italic; }

.turn-summary { display: grid; grid-template-columns: 1fr auto; gap: 0.35rem 1rem; margin: 0; }
.turn-summary dt { color: #475569; }
.turn-summary dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
.turn-summary dt.turn-summary__total,
.turn-summary dd.turn-summary__total { font-weight: 700; color: #0f172a; }
.turn-summary dd.is-negative { color: #b91c1c; }
.turn-summary .is-info { color: #64748b; font-style: italic; }

.turn-page__actions { margin-top: 1.25rem; display: flex; justify-content: flex-end; }

/* ===== Página de ciclos ===== */

.cycles-page__subtitle { font-size: 1.05rem; margin: 1.5rem 0 0.6rem; }
.cycles-page__subtitle small { font-weight: 400; color: #64748b; }
.cycles-table-wrap { overflow-x: auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; }
.cycles-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.cycles-table th,
.cycles-table td { padding: 0.55rem 0.8rem; text-align: right; white-space: nowrap; border-bottom: 1px solid #f1f5f9; }
.cycles-table th:first-child,
.cycles-table td:first-child { text-align: left; }
.cycles-table th { color: #64748b; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.02em; }
.cycles-table tbody tr:last-child td { border-bottom: none; }
.cycles-table a { color: var(--brand); font-weight: 600; text-decoration: none; }
.cycles-table td.is-negative { color: #b91c1c; }
.cycles-table td.cycles-table__empty { text-align: left; color: #64748b; font-style: italic; }
```

Em `app/assets/stylesheets/application.css`, acrescentar `@import "cycles.css";` depois de `@import "tour.css";`.

Em `app/assets/stylesheets/cards.css`:
- trocar `content: "Sem lançamentos nesse mês.";` por `content: "Sem lançamentos neste ciclo.";`;
- apagar o bloco de comentário "Estado 'ignorada no resumo'" e as regras `.card-item__items li.card-item__items-row--excluded ...` e `.card-item__item-action--excluded-on ...`.

- [ ] **Step 4: Ver funcionando no ensaio**

O menu da compra só existe no Task 14; aqui o "⋯" ainda não abre nada.

```bash
docker compose run --rm -e POSTGRES_DB=finansheet_ensaio app bin/rails runner 'puts AuthToken.encode(user_id: User.find_by!(email: "dev@finansheet.local").id)' | tail -1
docker compose run --rm --service-ports -e POSTGRES_DB=finansheet_ensaio app bin/rails server -b 0.0.0.0 -p 3001
```
(o servidor em segundo plano). Abrir `http://localhost:3001/login` num Chrome headless isolado e gravar `auth_token` no `localStorage` com o token acima. Depois abrir `/dashboard`. Expected:
- o título mostra "Ciclo aberto · desde 04/out";
- os cartões mostram "Neste ciclo" e "Parcelas futuras";
- o "Fogão - Mãe" aparece com a etiqueta "Outra pessoa";
- "◀" leva a "10/set → 04/out" (Fechado), "▶" leva a "Próximo ciclo (prévia)";
- o botão vira "Voltar ao ciclo aberto" fora do ciclo aberto;
- "Marcar conferido" alterna.

Tirar screenshot de cada estado. Parar o servidor ao terminar (`docker compose ps` e `docker stop <container do run>`).

- [ ] **Step 5: Commit**

```bash
git add app/javascript/controllers/cards_controller.js app/views/home/index.html.erb app/assets/stylesheets
git commit -m "Dashboard navigates by cycle with card checks and third party tags"
```

---

### Task 14: Menu de ações da compra

**Files:**
- Create: `app/javascript/controllers/purchase_menu_controller.js`, `app/views/shared/_purchase_menu.html.erb`
- Modify: `app/views/home/index.html.erb` (render do partial)

**Interfaces:**
- Consumes:
  - o evento `purchase:menu-request { cardId, cycleStatus, inst, anchor }` (Task 13);
  - as rotas `prepay`, `cancel_remaining` e `third_party` (Tasks 5 e 9);
  - `GET /api/debts` (Task 10).
- Produces:
  - dispara `purchase:edit-request` e `purchase:remove-request`, com o mesmo `detail` que os modais existentes já esperam;
  - dispara `purchase:changed { cardId }` e `debts:changed` depois de cada ação.

- [ ] **Step 1: Criar o partial**

```erb
<%# Menu de ações de uma compra + diálogos de "cancelar o restante" e
    "de outra pessoa". Componente independente: abre com
    "purchase:menu-request", disparado pelo botão "⋯" do cards_controller. %>
<div data-controller="purchase-menu">
  <div class="purchase-menu" role="menu" data-purchase-menu-target="menu" hidden></div>

  <dialog class="modal" data-purchase-menu-target="cancelDialog">
    <header class="modal__header">
      <h2 class="modal__title">Cancelar o restante</h2>
      <button type="button" class="modal__close" data-action="purchase-menu#closeCancel" aria-label="Fechar">×</button>
    </header>
    <form class="modal__body" data-action="submit->purchase-menu#submitCancel">
      <p style="margin: 0 0 1rem;" data-purchase-menu-target="cancelSummary"></p>
      <label class="form-field">
        Cancelar a partir da parcela
        <select required data-purchase-menu-target="cancelFrom"></select>
      </label>
      <p style="margin: 0.75rem 0 0; font-size: 0.85rem; color: #64748b;">
        As parcelas canceladas somem e o total da compra passa a ser o que já foi pago.
      </p>
      <div class="modal__footer" style="margin: 1rem -1.25rem -1.25rem; padding: 1rem 1.25rem;">
        <button type="button" class="btn btn--ghost" data-action="purchase-menu#closeCancel">Voltar</button>
        <button type="submit" class="btn btn--primary" data-purchase-menu-target="cancelSubmit">Cancelar parcelas</button>
      </div>
    </form>
  </dialog>

  <dialog class="modal" data-purchase-menu-target="thirdPartyDialog">
    <header class="modal__header">
      <h2 class="modal__title">De outra pessoa</h2>
      <button type="button" class="modal__close" data-action="purchase-menu#closeThirdParty" aria-label="Fechar">×</button>
    </header>
    <form class="modal__body" data-action="submit->purchase-menu#submitThirdParty">
      <p style="margin: 0 0 1rem;" data-purchase-menu-target="thirdPartySummary"></p>
      <label class="form-field">
        Quem usou o cartão
        <input type="text" list="purchase-menu-names" placeholder="Ex.: Mãe" data-purchase-menu-target="thirdPartyInput">
        <datalist id="purchase-menu-names" data-purchase-menu-target="thirdPartyNames"></datalist>
      </label>
      <p style="margin: 0.75rem 0 0; font-size: 0.85rem; color: #64748b;">
        Deixe vazio para voltar a ser uma compra sua. Ela continua somando no cartão, mas sai da sua sobra.
      </p>
      <div class="modal__footer" style="margin: 1rem -1.25rem -1.25rem; padding: 1rem 1.25rem;">
        <button type="button" class="btn btn--ghost" data-action="purchase-menu#closeThirdParty">Cancelar</button>
        <button type="submit" class="btn btn--primary" data-purchase-menu-target="thirdPartySubmit">Salvar</button>
      </div>
    </form>
  </dialog>
</div>
```

Em `app/views/home/index.html.erb`, logo abaixo de `<%= render "shared/purchase_remove_modal" %>`: `<%= render "shared/purchase_menu" %>`.

- [ ] **Step 2: Criar o controller**

```js
import { Controller } from "@hotwired/stimulus"

// Menu de ações de uma compra (botão "⋯" de cada linha do cartão).
// Componente independente:
// - Abre com "purchase:menu-request" ({ cardId, cycleStatus, inst, anchor })
// - Editar/apagar reaproveitam os modais existentes
//   ("purchase:edit-request" / "purchase:remove-request")
// - Quitar, desfazer quitação, cancelar o restante e "de outra pessoa"
//   chamam a API aqui e avisam com "purchase:changed" + "debts:changed"
// Fora do ciclo aberto só "de outra pessoa" aparece (não muda valores).
export default class extends Controller {
  static targets = [
    "menu",
    "cancelDialog", "cancelSummary", "cancelFrom", "cancelSubmit",
    "thirdPartyDialog", "thirdPartySummary", "thirdPartyInput", "thirdPartyNames", "thirdPartySubmit",
  ]

  connect() {
    this.current = null
    this.anchor = null

    this.onRequest = (event) => this.open(event.detail)
    this.onOutside = (event) => {
      if (this.menuTarget.hidden) return
      if (this.menuTarget.contains(event.target) || this.anchor?.contains(event.target)) return
      this.closeMenu()
    }
    this.onKey = (event) => {
      if (event.key === "Escape") this.closeMenu()
    }

    window.addEventListener("purchase:menu-request", this.onRequest)
    document.addEventListener("click", this.onOutside, true)
    document.addEventListener("keydown", this.onKey)
  }

  disconnect() {
    window.removeEventListener("purchase:menu-request", this.onRequest)
    document.removeEventListener("click", this.onOutside, true)
    document.removeEventListener("keydown", this.onKey)
  }

  open({ cardId, cycleStatus, inst, anchor }) {
    // Segundo clique no mesmo "⋯" fecha.
    if (this.anchor === anchor && !this.menuTarget.hidden) {
      this.closeMenu()
      return
    }

    this.current = { cardId, inst }
    this.anchor = anchor

    const open  = cycleStatus === "open"
    const items = []
    if (open && inst.editable) {
      items.push(["Editar", () => this.emit("purchase:edit-request")])
      items.push(["Apagar", () => this.emit("purchase:remove-request"), "danger"])
    }
    if (open && inst.can_prepay)      items.push(["Quitar o restante", () => this.prepay()])
    if (open && inst.can_undo_prepay) items.push(["Desfazer quitação", () => this.call("DELETE", "prepay")])
    if (open && inst.cancel_from)     items.push(["Cancelar o restante…", () => this.openCancel()])
    items.push([inst.third_party_name ? "Mudar a pessoa…" : "De outra pessoa…", () => this.openThirdParty()])

    this.menuTarget.innerHTML = ""
    for (const [label, action, variant] of items) {
      const btn = document.createElement("button")
      btn.type = "button"
      btn.setAttribute("role", "menuitem")
      btn.className = variant ? `purchase-menu__item purchase-menu__item--${variant}` : "purchase-menu__item"
      btn.textContent = label
      btn.addEventListener("click", () => {
        this.closeMenu()
        action()
      })
      this.menuTarget.appendChild(btn)
    }

    this.menuTarget.hidden = false
    this.position(anchor)
  }

  // Abaixo do botão, alinhado pela direita; acima se não couber.
  position(anchor) {
    const rect = anchor.getBoundingClientRect()
    const menu = this.menuTarget
    const left = Math.max(8, Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8))
    let top = rect.bottom + 4
    if (top + menu.offsetHeight > window.innerHeight - 8) top = rect.top - menu.offsetHeight - 4
    menu.style.left = `${left}px`
    menu.style.top  = `${Math.max(8, top)}px`
  }

  closeMenu() {
    this.menuTarget.hidden = true
    this.anchor = null
  }

  emit(eventName) {
    const { cardId, inst } = this.current
    window.dispatchEvent(new CustomEvent(eventName, {
      detail: {
        cardId,
        purchaseId:        inst.purchase_id,
        description:       inst.description,
        totalAmount:       inst.purchase_total_amount,
        installmentsCount: inst.installments_count,
      },
    }))
  }

  async prepay() {
    const { inst } = this.current
    if (!confirm(`Quitar o restante de "${inst.description}"? As parcelas futuras entram no ciclo aberto.`)) return
    await this.call("POST", "prepay")
  }

  // ---- Cancelar o restante ----

  openCancel() {
    const { inst } = this.current
    this.cancelSummaryTarget.textContent = `${inst.description} — ${inst.installments_count} parcelas`
    this.cancelFromTarget.innerHTML = ""
    for (let n = inst.cancel_from; n <= inst.installments_count; n++) {
      const option = document.createElement("option")
      option.value = String(n)
      option.textContent = `${n}ª parcela`
      this.cancelFromTarget.appendChild(option)
    }
    this.cancelDialogTarget.showModal()
  }

  closeCancel() {
    this.cancelDialogTarget.close()
  }

  async submitCancel(event) {
    event.preventDefault()
    this.cancelSubmitTarget.disabled = true
    const ok = await this.call("POST", "cancel_remaining", { from_number: parseInt(this.cancelFromTarget.value, 10) })
    this.cancelSubmitTarget.disabled = false
    if (ok) this.closeCancel()
  }

  // ---- De outra pessoa ----

  openThirdParty() {
    const { inst } = this.current
    this.thirdPartySummaryTarget.textContent = inst.description
    this.thirdPartyInputTarget.value = inst.third_party_name ?? ""
    this.thirdPartyDialogTarget.showModal()
    this.thirdPartyInputTarget.focus()
    this.loadKnownNames()
  }

  closeThirdParty() {
    this.thirdPartyDialogTarget.close()
  }

  async submitThirdParty(event) {
    event.preventDefault()
    this.thirdPartySubmitTarget.disabled = true
    const ok = await this.call("PATCH", "third_party", { third_party_name: this.thirdPartyInputTarget.value.trim() })
    this.thirdPartySubmitTarget.disabled = false
    if (ok) this.closeThirdParty()
  }

  async loadKnownNames() {
    try {
      const resp = await this.authFetch("/api/debts")
      if (!resp.ok) return
      const data = await resp.json()
      this.thirdPartyNamesTarget.innerHTML = (data.known_names ?? [])
        .map((name) => `<option value="${escapeHtml(name)}"></option>`)
        .join("")
    } catch (err) {
      console.error("[purchase-menu] known names failed", err)
    }
  }

  // Chama uma ação da compra e avisa a tela. true em caso de sucesso.
  async call(method, action, body = null) {
    const { cardId, inst } = this.current
    try {
      const resp = await this.authFetch(`/api/cards/${cardId}/purchases/${inst.purchase_id}/${action}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        alert((data.errors || ["Erro ao atualizar a compra"]).join(", "))
        return false
      }
      window.dispatchEvent(new CustomEvent("purchase:changed", { detail: { cardId } }))
      window.dispatchEvent(new CustomEvent("debts:changed"))
      return true
    } catch (err) {
      console.error(`[purchase-menu] ${action} failed`, err)
      alert("Erro ao atualizar a compra.")
      return false
    }
  }

  authFetch(url, options = {}) {
    const token = localStorage.getItem("auth_token")
    const headers = {
      "Accept": "application/json",
      ...(options.headers ?? {}),
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    }
    return fetch(url, { ...options, headers })
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
```

- [ ] **Step 3: Ver funcionando no ensaio**

Com o servidor do ensaio no ar (mesmo comando do Task 13, Step 4), no ciclo aberto:
1. "⋯" de uma compra parcelada nova: mostra Editar, Apagar, Quitar o restante e De outra pessoa.
2. Quitar o restante: o total "Neste ciclo" sobe, a etiqueta "quitada" aparece e o menu passa a mostrar "Desfazer quitação". Desfazer volta ao valor anterior.
3. "Fogão - Mãe" (parcela fechada): o menu não mostra Editar/Apagar; mostra "Cancelar o restante…" e "Mudar a pessoa…".
4. Renomear "Outra pessoa" para "Mãe": a etiqueta muda.
5. Num ciclo fechado ("◀"), só aparece "Mudar a pessoa…" / "De outra pessoa…".
6. Clicar fora ou apertar Esc fecha o menu.

Antes de seguir, desfazer no ensaio o que foi alterado no teste: desfazer a quitação; o nome "Mãe" pode ficar.

- [ ] **Step 4: Commit**

```bash
git add app/javascript/controllers/purchase_menu_controller.js app/views/shared/_purchase_menu.html.erb app/views/home/index.html.erb
git commit -m "Purchase actions menu: prepay, cancel remaining, third party"
```

---

### Task 15: Lateral (resumo, renda, contas fixas e "Me devem")

**Files:**
- Modify (reescrever inteiro): `app/javascript/controllers/cycle_summary_controller.js`, `app/javascript/controllers/fixed_expenses_summary_controller.js`
- Create: `app/javascript/controllers/debts_controller.js`
- Modify: `app/javascript/controllers/income_controller.js`, `app/javascript/controllers/fixed_expenses_modal_controller.js`, `app/views/shared/_sidebar.html.erb`, `app/views/shared/_income_modal.html.erb`, `app/views/shared/_fixed_expenses_modal.html.erb`

**Interfaces:**
- Consumes:
  - o evento `cycle:summary-update` do Task 13;
  - `PATCH /api/cycles/current` (Task 6);
  - `GET /api/fixed_expenses?cycle=N` (Task 4);
  - `GET /api/debts` e `POST /api/debts/reimburse` (Task 10).
- Produces (eventos):
  - `cycle:fixed-expenses-update { cycleNumber, total }`;
  - `fixed-expenses:open-request { cycleNumber, label }`;
  - `fixed-expenses:changed { cycleNumber, total, paidTotal, pendingTotal }`;
  - `income:changed { amount }`.

- [ ] **Step 1: Reescrever `cycle_summary_controller.js`**

```js
import { Controller } from "@hotwired/stimulus"

// Resumo do ciclo na sidebar. Componente independente:
// - Ouve "cycle:summary-update" (cards_controller) com { cycleNumber, status,
//   label, expectedIncome, cardLines: [{name, total}], thirdPartyTotal }
// - Ouve "cycle:fixed-expenses-update" com o total de contas fixas do ciclo
// - Sobra = a receber − seus cartões − contas fixas. "De outras pessoas"
//   aparece numa linha à parte e não entra na conta.
// - "Editar" (só no ciclo aberto) dispatcha "income:edit-request"
export default class extends Controller {
  static targets = ["root", "lines", "balance", "month"]

  connect() {
    this.state = null
    this.fixedExpensesTotal = 0

    this.onUpdate = (event) => {
      const previous = this.state?.cycleNumber
      this.state = event.detail ?? null
      if (this.state?.cycleNumber !== previous) this.fixedExpensesTotal = 0
      this.render()
    }
    this.onFixedExpenses = (event) => {
      if (event.detail?.cycleNumber !== this.state?.cycleNumber) return
      this.fixedExpensesTotal = Number(event.detail?.total ?? 0)
      this.render()
    }

    window.addEventListener("cycle:summary-update",        this.onUpdate)
    window.addEventListener("cycle:fixed-expenses-update", this.onFixedExpenses)
  }

  disconnect() {
    window.removeEventListener("cycle:summary-update",        this.onUpdate)
    window.removeEventListener("cycle:fixed-expenses-update", this.onFixedExpenses)
  }

  openIncome() {
    if (this.state?.status !== "open") return
    window.dispatchEvent(new CustomEvent("income:edit-request", {
      detail: { amount: this.state.expectedIncome },
    }))
  }

  render() {
    if (!this.state) {
      this.rootTarget.hidden = true
      return
    }

    const { label, status, expectedIncome, cardLines, thirdPartyTotal } = this.state
    const cardsTotal = (cardLines ?? []).reduce((sum, l) => sum + Number(l.total), 0)
    const fixedTotal = Number(this.fixedExpensesTotal ?? 0)
    const balance    = Number(expectedIncome ?? 0) - cardsTotal - fixedTotal

    this.monthTarget.textContent = label ?? ""

    const incomeBtn = status === "open"
      ? `<button type="button" class="sidebar-cycle__action" data-action="cycle-summary#openIncome">Editar</button>`
      : ""

    const lines = [
      `<li class="sidebar-cycle__line sidebar-cycle__line--income">
         <span class="sidebar-cycle__line-name">A receber</span>
         <span class="sidebar-cycle__value">${formatBRL(expectedIncome ?? 0)}</span>
         ${incomeBtn}
       </li>`,
      ...(cardLines ?? []).map((l) => `
         <li class="sidebar-cycle__line">
           <span class="sidebar-cycle__line-name">${escapeHtml(l.name || "—")}</span>
           <span class="sidebar-cycle__value sidebar-cycle__value--debit">− ${formatBRL(l.total)}</span>
         </li>`),
      ...(fixedTotal > 0 ? [`
         <li class="sidebar-cycle__line">
           <span class="sidebar-cycle__line-name">Contas Fixas</span>
           <span class="sidebar-cycle__value sidebar-cycle__value--debit">− ${formatBRL(fixedTotal)}</span>
         </li>`] : []),
      ...(Number(thirdPartyTotal) > 0 ? [`
         <li class="sidebar-cycle__line sidebar-cycle__line--info">
           <span class="sidebar-cycle__line-name">De outras pessoas</span>
           <span class="sidebar-cycle__value">${formatBRL(thirdPartyTotal)}</span>
         </li>`] : []),
    ]

    this.linesTarget.innerHTML = lines.join("")
    this.balanceTarget.textContent = formatBRL(balance)
    this.balanceTarget.classList.toggle("sidebar-cycle__balance--negative", balance < 0)
    this.rootTarget.hidden = false
  }
}

function formatBRL(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return "R$ 0,00"
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
```

- [ ] **Step 2: Reescrever `fixed_expenses_summary_controller.js`**

```js
import { Controller } from "@hotwired/stimulus"

// Resumo de Contas Fixas na sidebar. Componente independente:
// - Faz suas próprias requests (GET /api/fixed_expenses?cycle=N)
// - Sincroniza com o ciclo visualizado ouvindo "cycle:summary-update"
// - "Ver detalhes" dispatcha "fixed-expenses:open-request" → modal
// - Ouve "fixed-expenses:changed" (modal) pra atualizar sem refetch
// Emite "cycle:fixed-expenses-update" → cycle_summary_controller soma na sobra.
export default class extends Controller {
  static targets = ["root", "total", "paid", "pending", "pendingRow"]

  connect() {
    this.cycleNumber = null
    this.label = null

    this.onCycleChange = (event) => {
      const number = event.detail?.cycleNumber
      this.label = event.detail?.label ?? this.label
      if (!number || number === this.cycleNumber) return
      this.cycleNumber = number
      this.fetchSummary()
    }
    this.onChanged = (event) => {
      if (!event.detail || event.detail.cycleNumber !== this.cycleNumber) return
      this.applyTotals(event.detail)
    }

    window.addEventListener("cycle:summary-update",   this.onCycleChange)
    window.addEventListener("fixed-expenses:changed", this.onChanged)
  }

  disconnect() {
    window.removeEventListener("cycle:summary-update",   this.onCycleChange)
    window.removeEventListener("fixed-expenses:changed", this.onChanged)
  }

  openModal() {
    if (!this.cycleNumber) return
    window.dispatchEvent(new CustomEvent("fixed-expenses:open-request", {
      detail: { cycleNumber: this.cycleNumber, label: this.label },
    }))
  }

  async fetchSummary() {
    try {
      const resp = await this.authFetch(`/api/fixed_expenses?cycle=${this.cycleNumber}`)
      if (!resp.ok) throw new Error(`GET /api/fixed_expenses falhou: ${resp.status}`)
      const data = await resp.json()
      this.applyTotals({ total: data.total, paidTotal: data.paid_total, pendingTotal: data.pending_total })
    } catch (err) {
      console.error("[fixed-expenses-summary] fetch failed", err)
      this.rootTarget.hidden = true
    }
  }

  applyTotals({ total, paidTotal, pendingTotal }) {
    const t    = Number(total ?? 0)
    const p    = Number(paidTotal ?? 0)
    const pend = Number(pendingTotal ?? (t - p))

    this.totalTarget.textContent   = formatBRL(t)
    this.paidTarget.textContent    = formatBRL(p)
    this.pendingTarget.textContent = formatBRL(pend)
    this.pendingRowTarget.hidden   = pend <= 0
    // Sempre visível: "Ver detalhes" permite cadastrar a primeira conta.
    this.rootTarget.hidden = false

    window.dispatchEvent(new CustomEvent("cycle:fixed-expenses-update", {
      detail: { cycleNumber: this.cycleNumber, total: t },
    }))
  }

  authFetch(url, options = {}) {
    const token = localStorage.getItem("auth_token")
    const headers = {
      "Accept": "application/json",
      ...(options.headers ?? {}),
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    }
    return fetch(url, { ...options, headers })
  }
}

function formatBRL(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return "R$ 0,00"
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}
```

- [ ] **Step 3: Ajustar o modal de contas fixas**

Em `app/javascript/controllers/fixed_expenses_modal_controller.js`:
1. Comentário do topo: trocar `GET /api/fixed_expenses?month=...` por `GET /api/fixed_expenses?cycle=N`; trocar "Abre por evento ... com { month }" por "Abre por evento "fixed-expenses:open-request" com { cycleNumber, label }".
2. `static targets`: remover `"fieldNextDueMonth"`.
3. `connect()`: trocar `this.month = null` por `this.cycleNumber = null`, e `this.cycleClosed = false` por `this.readOnly = false`. Trocar `this.onOpen = (event) => this.open(event.detail?.month)` por `this.onOpen = (event) => this.open(event.detail ?? {})`.
4. `open`:
   ```js
   async open({ cycleNumber, label }) {
     if (!cycleNumber) return
     this.cycleNumber = cycleNumber
     this.monthLabelTarget.textContent = label ?? ""
     this.resetForm()
     this.formTarget.hidden = true
     this.dialogTarget.showModal()
     await this.fetchList()
   }
   ```
5. `fetchList`: URL `/api/fixed_expenses?cycle=${this.cycleNumber}`, e trocar `this.cycleClosed = !!data.cycle_closed` por `this.readOnly = !data.editable`.
6. `renderList`: `this.closedBannerTarget.hidden = !this.readOnly` e `this.addButtonTarget.disabled = this.readOnly`.
7. `buildRow`: nas três ocorrências de `${item.cycle_closed ? "disabled" : ""}`, trocar por `${this.readOnly ? "disabled" : ""}`.
8. `openCreate`: `if (this.readOnly) return`.
9. `toggleParceled`: deixar só `this.parceledFieldsTarget.hidden = !this.fieldParceledTarget.checked`.
10. `submitForm`, dentro do bloco de parcelamento:
    - remover `const ndm = ...`, o `if (!ndm) {...}` e `payload.next_due_month = ...`;
    - trocar o body por `JSON.stringify({ fixed_expense: payload })`.
11. `emitChanged`: `month: this.month` vira `cycleNumber: this.cycleNumber`.
12. Apagar a função `formatMonthLabel`.

Em `app/views/shared/_fixed_expenses_modal.html.erb`:
- o banner `closedBanner` passa a dizer `Este não é o ciclo aberto (fechado ou prévia): só leitura.`;
- remover o `<label class="form-field">` "Mês da próxima parcela a vencer" inteiro;
- o `data-popover-text-value` do "Compra parcelada" passa a ser `Marque se essa conta tem fim — ex: sofá em 10×. Ela some sozinha depois da última parcela. Se já pagou parte, informe quantas: a próxima cai neste ciclo.`

- [ ] **Step 4: Ajustar o modal de renda**

Em `app/javascript/controllers/income_controller.js`:
- comentário do topo:
  ```js
  // Modal de definir/editar o "A receber" do ciclo aberto. Componente independente:
  // - Ouve "income:edit-request" (detail: { amount })
  // - Salva via PATCH /api/cycles/current { expected_income }
  // - Em sucesso, dispatcha "income:changed" ({ amount }) pro cards_controller
  ```
- `openWith(detail)`: remover `if (!detail.month) return` e `this.month = detail.month`. O título fica `detail.amount ? "Editar A receber" : "Definir A receber"` e o valor `this.amountInputTarget.value = detail.amount ? String(detail.amount) : ""`.
- `submit`, a chamada:
  ```js
      const resp = await this.authFetch(`/api/cycles/current`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_income: amount }),
      })
  ```
  e o evento: `detail: { amount: data.cycle?.expected_income ?? amount }`.

Em `app/views/shared/_income_modal.html.erb`:
- comentário: `Modal de definir/editar o "A receber" do ciclo aberto (PATCH /api/cycles/current).`
- parágrafo: `Quanto você espera receber para pagar este ciclo? Ao virar, o valor é copiado para o ciclo novo.`

- [ ] **Step 5: "Me devem" na sidebar**

Em `app/views/shared/_sidebar.html.erb`, entre a `</section>` de Contas Fixas e `<div class="sidebar-footer">`:

```erb
    <%# "Me devem" — compras de outras pessoas nos seus cartões. Só aparece
        quando alguém deve algo. %>
    <section class="sidebar-fixed sidebar-debts" data-controller="debts"
             data-debts-target="root" hidden>
      <header class="sidebar-fixed__header">
        <h2 class="sidebar-fixed__title">Me devem</h2>
      </header>
      <ul class="sidebar-debts__list" data-debts-target="list"></ul>
    </section>
```
e trocar o `<span>Saldo</span>` do rodapé do resumo por `<span>Sobra</span>`.

Criar `app/javascript/controllers/debts_controller.js`:

```js
import { Controller } from "@hotwired/stimulus"

// "Me devem" na sidebar (GET /api/debts). Cada pessoa abre a lista de
// parcelas; "devolveu" marca uma parcela, "Devolveu tudo" marca todas
// (POST /api/debts/reimburse). Recarrega em "debts:changed" e
// "purchase:changed".
export default class extends Controller {
  static targets = ["root", "list"]

  connect() {
    this.debts = []
    this.openPeople = new Set()
    this.onChanged = () => this.fetchDebts()
    window.addEventListener("debts:changed",    this.onChanged)
    window.addEventListener("purchase:changed", this.onChanged)
    this.fetchDebts()
  }

  disconnect() {
    window.removeEventListener("debts:changed",    this.onChanged)
    window.removeEventListener("purchase:changed", this.onChanged)
  }

  async fetchDebts() {
    try {
      const resp = await this.authFetch("/api/debts")
      if (!resp.ok) throw new Error(`GET /api/debts falhou: ${resp.status}`)
      this.debts = (await resp.json()).debts ?? []
      this.render()
    } catch (err) {
      console.error("[debts] fetch failed", err)
      this.rootTarget.hidden = true
    }
  }

  render() {
    this.rootTarget.hidden = this.debts.length === 0
    this.listTarget.innerHTML = this.debts.map((debt, index) => `
      <li>
        <button type="button" class="sidebar-debts__toggle" data-action="debts#toggle" data-index="${index}">
          <span>${escapeHtml(debt.name)}</span>
          <strong>${formatBRL(debt.total)}</strong>
        </button>
        <div class="sidebar-debts__items" ${this.openPeople.has(debt.name) ? "" : "hidden"}>
          <ul>
            ${debt.items.map((item) => `
              <li>
                <span>${escapeHtml(item.description)}${item.installments_count > 1 ? ` ${item.number}/${item.installments_count}` : ""}</span>
                <span>${formatBRL(item.amount)}</span>
                <button type="button" data-action="debts#reimburseOne" data-id="${item.installment_id}">devolveu</button>
              </li>`).join("")}
          </ul>
          <button type="button" class="sidebar-debts__all" data-action="debts#reimburseAll" data-index="${index}">Devolveu tudo</button>
        </div>
      </li>`).join("")
  }

  toggle(event) {
    const name = this.debts[Number(event.currentTarget.dataset.index)]?.name
    if (!name) return
    if (this.openPeople.has(name)) this.openPeople.delete(name)
    else this.openPeople.add(name)
    this.render()
  }

  reimburseOne(event) {
    this.reimburse([event.currentTarget.dataset.id])
  }

  reimburseAll(event) {
    const debt = this.debts[Number(event.currentTarget.dataset.index)]
    if (!debt) return
    if (!confirm(`${debt.name} devolveu ${formatBRL(debt.total)}?`)) return
    this.reimburse(debt.items.map((item) => item.installment_id))
  }

  async reimburse(ids) {
    try {
      const resp = await this.authFetch("/api/debts/reimburse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installment_ids: ids }),
      })
      if (!resp.ok) throw new Error(`reimburse falhou: ${resp.status}`)
      await this.fetchDebts()
    } catch (err) {
      console.error("[debts] reimburse failed", err)
      alert("Erro ao marcar a devolução.")
    }
  }

  authFetch(url, options = {}) {
    const token = localStorage.getItem("auth_token")
    const headers = {
      "Accept": "application/json",
      ...(options.headers ?? {}),
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    }
    return fetch(url, { ...options, headers })
  }
}

function formatBRL(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return "R$ 0,00"
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
```

- [ ] **Step 6: Ver funcionando no ensaio**

Com o servidor do ensaio, em `/dashboard`:
- **Resumo:** mostra "A receber", cada cartão só com as compras do usuário, "Contas Fixas", a linha "De outras pessoas" e a **Sobra**.
- **Editar a renda:** atualiza a sobra na hora.
- **Contas fixas:** abrem pelo "Ver detalhes" no ciclo aberto e permitem marcar como paga. Num ciclo fechado ficam só leitura, com o banner.
- **"Me devem":** mostra "Mãe" com o fogão; "devolveu" numa parcela tira a parcela da lista.

Desfazer no ensaio o que for alterado (marcar a parcela de volta): `UPDATE installments SET reimbursed_at = NULL WHERE id = '<id>'` via `docker exec -i ... psql -d finansheet_ensaio`.

- [ ] **Step 7: Commit**

```bash
git add app/javascript/controllers app/views/shared
git commit -m "Sidebar by cycle: summary with leftover, income, fixed expenses and debts"
```

---

### Task 16: Tela de virada

**Files:**
- Create: `app/views/home/turn.html.erb`, `app/javascript/controllers/turn_controller.js`, `test/controllers/home_controller_test.rb`
- Modify: `app/controllers/home_controller.rb`, `config/routes.rb`

**Interfaces:**
- Consumes:
  - `GET /api/cycles` (`open`, `can_undo`), `GET /api/cards`, `GET /api/cards/:id/installments`, `GET /api/fixed_expenses`, `GET /api/debts`;
  - `PATCH /api/cycles/current`, `POST /api/cycles/current/turn`, `POST /api/cycles/last/undo`;
  - `PUT` e `DELETE .../check`, `PATCH /api/fixed_expense_payments/:id`.
- Produces: a página `GET /dashboard/virada` (helper `turn_path`).

- [ ] **Step 1: Teste das páginas novas**

```ruby
# test/controllers/home_controller_test.rb
require "test_helper"

# As páginas são cascas: os dados chegam por fetch na API (com token).
class HomeControllerTest < ActionDispatch::IntegrationTest
  test "turn page renders" do
    get "/dashboard/virada"

    assert_response :ok
    assert_includes response.body, 'data-controller="turn"'
  end
end
```

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test test/controllers/home_controller_test.rb`
Expected: FAIL com `No route matches [GET] "/dashboard/virada"`.

- [ ] **Step 2: Rota e action**

Em `config/routes.rb`, abaixo de `get "dashboard" => "home#index", as: :dashboard`:

```ruby
  get "dashboard/virada" => "home#turn", as: :turn
```

```ruby
# app/controllers/home_controller.rb
class HomeController < ApplicationController
  def index
  end

  # Tela de virada: checklist do ciclo aberto (dados via API, turn_controller).
  def turn
  end
end
```

- [ ] **Step 3: View**

```erb
<% content_for :title, "FinanSheet — Virada" %>

<section class="turn-page" data-controller="turn">
  <header class="cards-page__header">
    <h1 class="cards-page__title">Virada do ciclo</h1>
    <a href="/dashboard" class="action-btn action-btn--primary">Voltar aos cartões</a>
  </header>
  <p class="turn-page__period" data-turn-target="period">Carregando…</p>

  <div class="turn-page__banner turn-page__banner--done" data-turn-target="done" hidden>
    <span>Ciclo virado. O próximo já está aberto e limpo.</span>
    <a href="/dashboard" class="btn btn--primary">Ir para os cartões</a>
  </div>

  <div class="turn-page__banner" data-turn-target="undoBox" hidden>
    <span>Virou por engano ou cedo demais? O ciclo novo ainda está intocado.</span>
    <button type="button" class="btn btn--ghost" data-action="turn#undo">Desfazer a última virada</button>
  </div>

  <ol class="turn-steps">
    <li class="turn-step">
      <h2 class="turn-step__title">1. Renda</h2>
      <form class="turn-step__income" data-action="submit->turn#saveIncome">
        <label class="form-field">
          A receber neste ciclo (R$)
          <input type="number" step="0.01" min="0" required data-turn-target="income">
        </label>
        <button type="submit" class="btn btn--primary" data-turn-target="incomeSubmit">Salvar</button>
      </form>
    </li>

    <li class="turn-step">
      <h2 class="turn-step__title">2. Cartões <small>confira com o app do banco</small></h2>
      <ul class="turn-list" data-turn-target="cards"></ul>
    </li>

    <li class="turn-step">
      <h2 class="turn-step__title">
        3. Contas fixas
        <button type="button" class="turn-step__shortcut" data-action="turn#payAll">Marcar todas</button>
      </h2>
      <ul class="turn-list" data-turn-target="fixed"></ul>
    </li>

    <li class="turn-step" data-turn-target="debtsStep" hidden>
      <h2 class="turn-step__title">4. Devoluções pendentes</h2>
      <ul class="turn-list" data-turn-target="debts"></ul>
    </li>

    <li class="turn-step">
      <h2 class="turn-step__title">Resumo</h2>
      <dl class="turn-summary" data-turn-target="summary"></dl>
    </li>
  </ol>

  <div class="turn-page__actions">
    <button type="button" class="action-btn action-btn--success" data-action="turn#turn" data-turn-target="turnButton">
      Virar ciclo
    </button>
  </div>
</section>
```

- [ ] **Step 4: Controller**

```js
import { Controller } from "@hotwired/stimulus"

// Tela de virada (/dashboard/virada): checklist do ciclo aberto.
//   1. Renda (PATCH /api/cycles/current)
//   2. Cartões: total a pagar agora, suas / de outras pessoas, conferido ✓
//   3. Contas fixas: pago ✓, valor ajustável (inclusive 0), "marcar todas"
//   4. Devoluções pendentes (só aviso)
//   Resumo + "Virar ciclo": avisa pendências e pede confirmação (não bloqueia).
// Depois de virar, oferece "desfazer a última virada" enquanto o ciclo novo
// estiver intocado.
export default class extends Controller {
  static targets = [
    "period", "done", "undoBox", "income", "incomeSubmit",
    "cards", "fixed", "debtsStep", "debts", "summary", "turnButton",
  ]

  connect() {
    this.load()
  }

  async load() {
    try {
      const [cycles, cardsData, fixed, debts] = await Promise.all([
        this.getJSON("/api/cycles"),
        this.getJSON("/api/cards"),
        this.getJSON("/api/fixed_expenses"),
        this.getJSON("/api/debts"),
      ])
      this.cycle   = cycles.open
      this.canUndo = cycles.can_undo
      this.cards   = cardsData.cards ?? []
      this.fixed   = fixed.items ?? []
      this.debts   = debts.debts ?? []

      this.cardTotals = {}
      await Promise.all(this.cards.map(async (card) => {
        this.cardTotals[card.id] = await this.getJSON(`/api/cards/${card.id}/installments?cycle=${this.cycle.number}`)
      }))

      this.render()
    } catch (err) {
      console.error("[turn] load failed", err)
      this.periodTarget.textContent = "Erro ao carregar o ciclo."
    }
  }

  render() {
    this.periodTarget.textContent = `Ciclo aberto desde ${formatShortDate(this.cycle.started_at)}`
    this.undoBoxTarget.hidden = !this.canUndo
    this.incomeTarget.value = this.cycle.expected_income
    this.renderCards()
    this.renderFixed()
    this.renderDebts()
    this.renderSummary()
  }

  // ---- 1. Renda ----

  async saveIncome(event) {
    event.preventDefault()
    const amount = parseFloat(this.incomeTarget.value)
    if (!Number.isFinite(amount) || amount < 0) return

    this.incomeSubmitTarget.disabled = true
    try {
      const data = await this.send("PATCH", "/api/cycles/current", { expected_income: amount })
      if (data) {
        this.cycle = { ...this.cycle, expected_income: data.cycle.expected_income }
        this.renderSummary()
      }
    } finally {
      this.incomeSubmitTarget.disabled = false
    }
  }

  // ---- 2. Cartões ----

  renderCards() {
    if (this.cards.length === 0) {
      this.cardsTarget.innerHTML = `<li class="turn-list__empty">Nenhum cartão cadastrado.</li>`
      return
    }

    this.cardsTarget.innerHTML = this.cards.map((card) => {
      const { total, own, third } = this.cardSplit(card)
      const detail = third > 0
        ? ` · suas ${formatBRL(own)} + de outras pessoas ${formatBRL(third)}`
        : ""
      return `
        <li class="turn-list__row ${card.checked ? "turn-list__row--done" : ""}">
          <label class="turn-list__check">
            <input type="checkbox" data-action="change->turn#toggleCard" data-card-id="${card.id}" ${card.checked ? "checked" : ""}>
            <span>
              <strong>${escapeHtml(card.name || "—")}</strong>
              <small>Fecha dia ${card.best_day ?? "—"} · vence dia ${card.pay_day ?? "—"}${detail}</small>
            </span>
          </label>
          <span class="turn-list__amount">${formatBRL(total)}</span>
        </li>`
    }).join("")
  }

  cardSplit(card) {
    const data  = this.cardTotals[card.id] ?? {}
    const total = Number(data.cycle_total ?? 0)
    const own   = Number(data.cycle_total_own ?? 0)
    return { total, own, third: total - own }
  }

  async toggleCard(event) {
    const input = event.currentTarget
    const card = this.cards.find((c) => c.id === input.dataset.cardId)
    if (!card) return

    input.disabled = true
    const ok = await this.send(input.checked ? "PUT" : "DELETE", `/api/cycles/current/cards/${card.id}/check`)
    if (ok) card.checked = input.checked
    this.renderCards()
  }

  // ---- 3. Contas fixas ----

  renderFixed() {
    if (this.fixed.length === 0) {
      this.fixedTarget.innerHTML = `<li class="turn-list__empty">Nenhuma conta fixa neste ciclo.</li>`
      return
    }

    this.fixedTarget.innerHTML = this.fixed.map((item) => {
      const installment = item.installments_count ? ` ${item.installment_number}/${item.installments_count}` : ""
      return `
        <li class="turn-list__row ${item.paid_at ? "turn-list__row--done" : ""}">
          <label class="turn-list__check">
            <input type="checkbox" data-action="change->turn#togglePaid" data-payment-id="${item.payment_id}" ${item.paid_at ? "checked" : ""}>
            <span>
              <strong>${escapeHtml(item.name)}${installment}</strong>
              <small>${item.due_day ? `Vence dia ${item.due_day}` : "Sem vencimento"}</small>
            </span>
          </label>
          <input type="number" step="0.01" min="0" class="turn-list__amount-input"
                 value="${item.amount}" aria-label="Valor de ${escapeHtml(item.name)} neste ciclo"
                 data-action="change->turn#changeAmount" data-payment-id="${item.payment_id}">
        </li>`
    }).join("")
  }

  async togglePaid(event) {
    const input = event.currentTarget
    await this.updatePayment(input.dataset.paymentId, { paid: input.checked })
  }

  async changeAmount(event) {
    const input = event.currentTarget
    const amount = parseFloat(input.value)
    if (!Number.isFinite(amount) || amount < 0) {
      this.renderFixed()
      return
    }
    await this.updatePayment(input.dataset.paymentId, { amount })
  }

  async payAll() {
    for (const item of this.fixed.filter((i) => !i.paid_at)) {
      await this.updatePayment(item.payment_id, { paid: true }, { render: false })
    }
    this.renderFixed()
    this.renderSummary()
  }

  async updatePayment(paymentId, body, { render = true } = {}) {
    const data = await this.send("PATCH", `/api/fixed_expense_payments/${paymentId}`, body)
    const item = this.fixed.find((i) => i.payment_id === paymentId)
    if (data && item) {
      item.paid_at = data.payment.paid_at
      item.amount  = data.payment.amount
    }
    if (render) {
      this.renderFixed()
      this.renderSummary()
    }
  }

  // ---- 4. Devoluções ----

  renderDebts() {
    this.debtsStepTarget.hidden = this.debts.length === 0
    this.debtsTarget.innerHTML = this.debts.map((debt) => `
      <li class="turn-list__row">
        <span>${escapeHtml(debt.name)} te deve</span>
        <span class="turn-list__amount">${formatBRL(debt.total)}</span>
      </li>`).join("")
  }

  // ---- Resumo ----

  renderSummary() {
    const income = Number(this.cycle.expected_income ?? 0)
    const own    = this.cards.reduce((sum, card) => sum + this.cardSplit(card).own, 0)
    const third  = this.cards.reduce((sum, card) => sum + this.cardSplit(card).third, 0)
    const fixed  = this.fixed.reduce((sum, item) => sum + Number(item.amount), 0)
    const left   = income - own - fixed

    this.summaryTarget.innerHTML = `
      <dt>A receber</dt><dd>${formatBRL(income)}</dd>
      <dt>Seus cartões</dt><dd>− ${formatBRL(own)}</dd>
      <dt>Contas fixas</dt><dd>− ${formatBRL(fixed)}</dd>
      <dt class="turn-summary__total">Sobra</dt>
      <dd class="turn-summary__total ${left < 0 ? "is-negative" : ""}">${formatBRL(left)}</dd>
      ${third > 0 ? `<dt class="is-info">De outras pessoas (fora da sobra)</dt><dd class="is-info">${formatBRL(third)}</dd>` : ""}`
  }

  // ---- Virar / desfazer ----

  pendingItems() {
    const cards = this.cards
      .filter((card) => !card.checked && this.cardSplit(card).total > 0)
      .map((card) => `${card.name} não conferido`)
    const fixed = this.fixed
      .filter((item) => !item.paid_at && Number(item.amount) > 0)
      .map((item) => `${item.name} não paga`)
    return [...cards, ...fixed]
  }

  async turn() {
    const pending = this.pendingItems()
    const message = pending.length > 0
      ? `Ainda falta:\n• ${pending.join("\n• ")}\n\nVirar o ciclo mesmo assim?`
      : "Tudo conferido. Virar o ciclo agora?"
    if (!confirm(message)) return

    this.turnButtonTarget.disabled = true
    try {
      const resp = await this.authFetch("/api/cycles/current/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycle_id: this.cycle.id }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        alert((data.errors || ["Erro ao virar o ciclo"]).join(", "))
        await this.load()
        return
      }
      this.doneTarget.hidden = false
      window.scrollTo({ top: 0, behavior: "smooth" })
      await this.load()
    } catch (err) {
      console.error("[turn] turn failed", err)
      alert("Erro ao virar o ciclo.")
    } finally {
      this.turnButtonTarget.disabled = false
    }
  }

  async undo() {
    if (!confirm("Desfazer a última virada? O ciclo anterior volta a ficar aberto.")) return
    const data = await this.send("POST", "/api/cycles/last/undo")
    if (!data) return
    this.doneTarget.hidden = true
    await this.load()
  }

  // ---- HTTP ----

  async getJSON(url) {
    const resp = await this.authFetch(url)
    if (!resp.ok) throw new Error(`GET ${url} falhou: ${resp.status}`)
    return resp.json()
  }

  // Envia e devolve o JSON da resposta (ou null com alerta em caso de erro).
  async send(method, url, body = null) {
    try {
      const resp = await this.authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        alert((data.errors || ["Erro ao salvar"]).join(", "))
        return null
      }
      return data
    } catch (err) {
      console.error(`[turn] ${method} ${url} failed`, err)
      alert("Falha de rede. Tente de novo.")
      return null
    }
  }

  authFetch(url, options = {}) {
    const token = localStorage.getItem("auth_token")
    const headers = {
      "Accept": "application/json",
      ...(options.headers ?? {}),
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    }
    return fetch(url, { ...options, headers })
  }
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

// "12/out"
function formatShortDate(iso) {
  if (!iso) return "—"
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, "0")}/${MONTHS[d.getMonth()]}`
}

function formatBRL(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return "R$ 0,00"
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
```

- [ ] **Step 5: Rodar o teste e ver no ensaio**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test test/controllers/home_controller_test.rb`
Expected: PASS.

No ensaio (servidor + token do Task 13), em `/dashboard/virada`:
- Mostra "Ciclo aberto desde 04/out", a renda, os cartões com total e conferido, as contas fixas com pago e valor, "Mãe te deve" e o resumo com a sobra.
- Marcar um cartão como conferido e uma conta como paga: o "conferido" aparece também no `/dashboard`.
- **Virar:** o aviso lista o que falta. Ao confirmar, aparece o banner "Ciclo virado", o período passa a "desde <hoje>" e aparece "Desfazer a última virada".
- **Desfazer:** volta ao ciclo anterior com tudo como estava.
- Ao terminar, deixar o ensaio no estado de antes: desfazer a virada, se ainda estiver virado, e desmarcar o que foi marcado.

- [ ] **Step 6: Commit**

```bash
git add app/views/home/turn.html.erb app/javascript/controllers/turn_controller.js app/controllers/home_controller.rb config/routes.rb test/controllers/home_controller_test.rb
git commit -m "Turn page with checklist, summary and undo"
```

---

### Task 17: Página "Ciclos" (prévia e histórico)

**Files:**
- Create: `app/views/home/cycles.html.erb`, `app/javascript/controllers/cycles_page_controller.js`
- Modify: `app/controllers/home_controller.rb`, `config/routes.rb`, `test/controllers/home_controller_test.rb`

**Interfaces:**
- Consumes: `GET /api/cycles` (`open`, `upcoming`, `closed`).
- Produces: a página `GET /ciclos` (helper `cycles_page_path`).

- [ ] **Step 1: Teste**

Acrescentar em `test/controllers/home_controller_test.rb`:

```ruby
  test "cycles page renders" do
    get "/ciclos"

    assert_response :ok
    assert_includes response.body, 'data-controller="cycles-page"'
  end
```
Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test test/controllers/home_controller_test.rb`
Expected: FAIL com `No route matches [GET] "/ciclos"`.

- [ ] **Step 2: Rota, action e view**

Em `config/routes.rb`, abaixo da rota da virada: `get "ciclos" => "home#cycles", as: :cycles_page`.

Em `app/controllers/home_controller.rb`, acrescentar:

```ruby
  # Prévia dos próximos ciclos e histórico dos fechados (dados via API).
  def cycles
  end
```

```erb
<% content_for :title, "FinanSheet — Ciclos" %>

<section class="cycles-page" data-controller="cycles-page">
  <header class="cards-page__header">
    <h1 class="cards-page__title">Ciclos</h1>
  </header>

  <h2 class="cycles-page__subtitle">Agora e próximos <small>o que já está comprometido</small></h2>
  <div class="cycles-table-wrap">
    <table class="cycles-table" data-cycles-page-target="upcoming"></table>
  </div>

  <h2 class="cycles-page__subtitle">Ciclos anteriores</h2>
  <div class="cycles-table-wrap">
    <table class="cycles-table" data-cycles-page-target="closed"></table>
  </div>
</section>
```

- [ ] **Step 3: Controller**

```js
import { Controller } from "@hotwired/stimulus"

// Página "Ciclos" (GET /api/cycles):
// - Agora e próximos: ciclo aberto (ao vivo) + prévia dos 6 seguintes
// - Anteriores: retrato gravado em cada virada
// Clicar no ciclo abre a tela principal nele (/dashboard?cycle=N).
export default class extends Controller {
  static targets = ["upcoming", "closed"]

  async connect() {
    try {
      const resp = await this.authFetch("/api/cycles")
      if (!resp.ok) throw new Error(`GET /api/cycles falhou: ${resp.status}`)
      const data = await resp.json()
      this.renderUpcoming(data.open, data.upcoming ?? [])
      this.renderClosed(data.closed ?? [])
    } catch (err) {
      console.error("[cycles-page] load failed", err)
      this.upcomingTarget.innerHTML = `<tbody><tr><td class="cycles-table__empty">Erro ao carregar os ciclos.</td></tr></tbody>`
    }
  }

  renderUpcoming(open, rows) {
    const openRow = tableRow(`Aberto · desde ${formatShortDate(open.started_at)}`, open.number, {
      income: open.expected_income, own: open.own_cards, third: open.third_party,
      fixed: open.fixed_expenses, balance: open.balance,
    })
    const next = rows.map((row) => {
      const ahead = row.number - open.number
      return tableRow(ahead === 1 ? "Próximo" : `Daqui a ${ahead}`, row.number, {
        income: row.expected_income, own: row.own_cards, third: row.third_party,
        fixed: row.fixed_expenses, balance: row.balance,
      })
    })
    this.upcomingTarget.innerHTML = tableHead("Ciclo", "A receber") + `<tbody>${[openRow, ...next].join("")}</tbody>`
  }

  renderClosed(rows) {
    if (rows.length === 0) {
      this.closedTarget.innerHTML = `<tbody><tr><td class="cycles-table__empty">Nenhum ciclo fechado ainda.</td></tr></tbody>`
      return
    }
    const body = rows.map((row) => tableRow(
      `${formatShortDate(row.started_at)} → ${formatShortDate(row.closed_at)}`, row.number,
      { income: row.income, own: row.own_cards, third: row.third_party, fixed: row.fixed_expenses, balance: row.balance },
    ))
    this.closedTarget.innerHTML = tableHead("Período", "Renda") + `<tbody>${body.join("")}</tbody>`
  }

  authFetch(url, options = {}) {
    const token = localStorage.getItem("auth_token")
    const headers = {
      "Accept": "application/json",
      ...(options.headers ?? {}),
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    }
    return fetch(url, { ...options, headers })
  }
}

function tableHead(first, incomeLabel) {
  return `<thead><tr>
    <th>${first}</th><th>${incomeLabel}</th><th>Seus cartões</th>
    <th>De outras pessoas</th><th>Contas fixas</th><th>Sobra</th>
  </tr></thead>`
}

function tableRow(label, number, { income, own, third, fixed, balance }) {
  return `<tr>
    <td><a href="/dashboard?cycle=${number}">${label}</a></td>
    <td>${formatBRL(income)}</td>
    <td>${formatBRL(own)}</td>
    <td>${formatBRL(third)}</td>
    <td>${formatBRL(fixed)}</td>
    <td class="${Number(balance) < 0 ? "is-negative" : ""}">${formatBRL(balance)}</td>
  </tr>`
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

// "12/out"
function formatShortDate(iso) {
  if (!iso) return "—"
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, "0")}/${MONTHS[d.getMonth()]}`
}

function formatBRL(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return "R$ 0,00"
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}
```

- [ ] **Step 4: Rodar o teste e ver no ensaio**

Run: `docker compose run --rm -e RAILS_ENV=test app bin/rails test test/controllers/home_controller_test.rb`
Expected: PASS.

No ensaio, `/ciclos` mostra:
- **Agora e próximos:** a linha do aberto e 6 de prévia.
- **Anteriores:** 4 linhas (junho a setembro), com a renda R$ 5.000,00 recuperada e a soma igual ao `total_expenses` antigo.

Clicar numa linha leva a `/dashboard?cycle=N`. Em largura de celular (390px), a tabela rola na horizontal dentro do quadro, sem quebrar a página.

- [ ] **Step 5: Commit**

```bash
git add app/views/home/cycles.html.erb app/javascript/controllers/cycles_page_controller.js app/controllers/home_controller.rb config/routes.rb test/controllers/home_controller_test.rb
git commit -m "Cycles page with projection and history"
```

---

### Task 18: Acabamentos (logo, textos, navegação, tour)

**Files:**
- Create: `app/assets/images/logo-on-dark.svg`
- Modify: `app/views/shared/_sidebar.html.erb`, `app/views/logins/new.html.erb`, `app/views/signups/new.html.erb`, `app/javascript/controllers/login_form_controller.js`, `app/javascript/controllers/tour_controller.js`

- [ ] **Step 1: Logo para fundo escuro**

Criar `app/assets/images/logo-on-dark.svg` com o mesmo conteúdo de `logo.svg`, trocando `<tspan fill="#0f172a">Sheet</tspan>` por `<tspan fill="#e2e8f0">Sheet</tspan>`. Na sidebar, `image_tag "logo.svg"` passa a `image_tag "logo-on-dark.svg"`. Login, cadastro e landing continuam com `logo.svg`, que tem fundo claro.

- [ ] **Step 2: Navegação e textos da sidebar**

Em `app/views/shared/_sidebar.html.erb`:
- `aria-label="Toggle menu"` vira `aria-label="Abrir menu"`.
- O conteúdo do `<nav class="sidebar-nav" aria-label="Main">` (hoje só um comentário) vira:

```erb
    <nav class="sidebar-nav" aria-label="Principal">
      <%= link_to "Cartões", dashboard_path, class: "sidebar-nav__link",
                  "aria-current": (current_page?(dashboard_path) ? "page" : nil) %>
      <%= link_to "Ciclos", cycles_page_path, class: "sidebar-nav__link",
                  "aria-current": (current_page?(cycles_page_path) ? "page" : nil) %>
    </nav>
```
- `Sign out` vira `Sair`.

- [ ] **Step 3: Login e cadastro em português**

Em `app/views/logins/new.html.erb`:

| antes | depois |
|---|---|
| título `Sign in · FinanSheet` | `Entrar · FinanSheet` |
| rótulo `Email` | `E-mail` |
| `Password` | `Senha` |
| `Remember me` | `Lembrar de mim` |
| botão `Sign in` | `Entrar` |
| `Forgot password?` | `Esqueci a senha` |

Em `app/views/signups/new.html.erb`: o rótulo `Email` vira `E-mail`.

Em `app/javascript/controllers/login_form_controller.js`:

| antes | depois |
|---|---|
| `"Invalid email or password"` | `"E-mail ou senha inválidos."` |
| `"Unable to reach server. Try again."` | `"Não foi possível falar com o servidor. Tente de novo."` |
| `loading ? "Signing in…" : "Sign in"` | `loading ? "Entrando…" : "Entrar"` |

Conferir que não sobrou nada:
Run: `grep -rnE "Sign (in|out|up)|Signing|Password|Remember me|Forgot|Toggle menu|Invalid email|Unable to reach" app/views app/javascript`
Expected: nenhuma linha.

- [ ] **Step 4: Tour**

Em `app/javascript/controllers/tour_controller.js`:

1. **Passo `bestDay`:** substituir o objeto inteiro por:
```js
      {
        key: "cardForm",
        target: '[data-cards-target="formModal"] label.form-field:has([data-cards-target="fieldName"])',
        focus:  '[data-cards-target="formModal"] [data-cards-target="fieldName"]',
        placement: "right",
        title: "Seu cartão",
        body: "Dê um nome e uma cor. <strong>Fecha dia</strong> e <strong>vence dia</strong> são opcionais: servem só para você conferir a fatura na virada.",
        advanceOn: "card:created",
        passive: false,
      },
```
2. **Passo `sidebar`:**
   - título: `"Sua visão do ciclo"`;
   - corpo: `"Tudo que entra (A receber) e sai (seus cartões + contas fixas) vira a <strong>sobra</strong> do ciclo aqui. Compras de outras pessoas aparecem à parte."`.
3. **Passo `closeCycle`:**
   - `target` passa a `'[data-cards-target="turnButton"]'`;
   - título: `"No dia em que receber"`;
   - corpo: `"Clique em <strong>Virar ciclo</strong>: a tela de virada mostra o que conferir e pagar antes de abrir o ciclo novo, limpo."`.
4. **Comentário do topo:** onde cita "fecha dia" entre os conceitos, trocar por "virada".

- [ ] **Step 5: Ver no ensaio e commit**

No ensaio:
- a sidebar mostra o logo inteiro, os links "Cartões" e "Ciclos" (o da página atual destacado) e "Sair";
- `/login` está todo em português.

Para ver o tour, no console da página: `localStorage` com token de uma conta sem tour feito; ou só conferir que o passo 2 aponta para o campo Nome ao abrir "Novo cartão".

```bash
git add app/assets/images/logo-on-dark.svg app/views app/javascript/controllers/login_form_controller.js app/javascript/controllers/tour_controller.js
git commit -m "Portuguese copy, sidebar navigation, readable logo and tour for cycles"
```

---

### Task 19: Teste de tela (smoke) e revisão completa no ensaio

**Files:**
- Modify: `e2e/tests/smoke.spec.ts`

- [ ] **Step 1: Reescrever o smoke (só leitura)**

```ts
import { test, expect } from '@playwright/test';

// Só leitura: o app em execução usa banco com dados reais. Fluxos que
// gravam ficam nos testes Rails (banco de teste).
test.describe('smoke', () => {
  for (const path of ['/', '/login', '/dashboard', '/dashboard/virada', '/ciclos']) {
    test(`${path} responde 200`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
    });
  }

  test('login em português', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Entrar · FinanSheet/);
  });
});
```

- [ ] **Step 2: Rodar contra o servidor do ensaio**

```bash
cd e2e && npm install && npx playwright install chromium
BASE_URL=http://localhost:3001 npx playwright test
```
Expected: 6 testes passando.

- [ ] **Step 3: Suíte, lint e segurança**

```bash
cd /home/hugo/Projects/finansheet
docker compose run --rm -e RAILS_ENV=test app bin/rails test
docker compose run --rm app bin/rubocop
docker compose run --rm app bin/brakeman --no-pager
docker compose run --rm app bin/importmap audit
```
Expected: tudo verde.

- [ ] **Step 4: Passada visual completa no ensaio**

Screenshots, em 1440px e 390px de largura, de:
- `/dashboard` (aberto, fechado, prévia);
- menu da compra aberto;
- modal de lançar compra;
- `/dashboard/virada`;
- `/ciclos`;
- sidebar com "Me devem".

Conferir:
- nada cortado nem sobreposto;
- textos em português;
- valores batendo entre a tela principal, a virada e a página de ciclos.

- [ ] **Step 5: Commit**

```bash
git add e2e/tests/smoke.spec.ts
git commit -m "Read-only smoke test for the new pages"
```

---

### Task 20: Virada para o banco real (só com autorização do Hugo)

**Files:** nenhum do repo (operação), mais a nota do vault.

- [ ] **Step 1: Pedir autorização**

Mostrar ao Hugo o resultado do ensaio: o `depois.txt` e as screenshots do Task 19. Perguntar se pode aplicar no banco real. **Não seguir sem um "pode" explícito.**

- [ ] **Step 2: Backup fresco do banco real**

```bash
B=~/docker-backup-finansheet-2026-10-12
docker exec finansheet-banco-uso-hugo-1 sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$B/finansheet_development-antes-da-virada.dump"
ls -la "$B"
```
Expected: dump com tamanho maior que zero.

- [ ] **Step 3: Migrar o banco real**

Run: `docker compose run --rm app bin/rails db:migrate`
Expected: as 3 migrations `migrated`, com as mesmas mensagens do ensaio (`ciclo aberto nº 5` para o dev, `nº 1` para a outra conta). Se aparecer `ConversionMismatch`, nada foi alterado (a transação desfaz); parar e investigar.

- [ ] **Step 4: Conferir contra o ensaio**

Rodar a consulta do Task 2, Step 3 apontando para o banco real (`-d "$POSTGRES_DB"` no lugar de `-d finansheet_ensaio`), salvar em `$B/depois-real.txt` e comparar:

Run: `diff "$B/depois.txt" "$B/depois-real.txt"`
Expected: diferenças só no que o usuário mexeu no ensaio durante os testes de tela (se algo não foi desfeito). Nos ciclos fechados e nos totais por cartão, nenhuma diferença.

- [ ] **Step 5: Subir o app e conferir**

```bash
docker compose up -d app
until curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/ | grep -q 200; do sleep 2; done
```
Abrir `/dashboard`, `/dashboard/virada` e `/ciclos` com os dados reais. Conferir:
- ciclo aberto "desde 04/out";
- 4 ciclos fechados com renda;
- cartões com os mesmos valores de antes.

- [ ] **Step 6: Vault e limpeza**

- Atualizar `Pessoal/Finansheet/Finansheet.md` no vault:
  - modelo novo (ciclos numerados, virada, quitar/cancelar, "Me devem");
  - data da virada para o banco real;
  - local do backup;
  - "a renda é por ciclo";
  - remover as observações que deixaram de valer (`POSTGRES_HOST` duplicado continua; `incomes` não existe mais).
- Commitar e dar push só desse arquivo no repo do vault.
- Perguntar ao Hugo se pode apagar o banco `finansheet_ensaio` (`docker exec finansheet-banco-uso-hugo-1 sh -c 'dropdb -U "$POSTGRES_USER" finansheet_ensaio'`).
- Seguir com `superpowers:finishing-a-development-branch` para decidir o merge da branch `ciclo-por-virada`.
