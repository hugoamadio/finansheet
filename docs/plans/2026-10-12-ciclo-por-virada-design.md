# Ciclo por virada — design

**Status:** aprovado em conversa, aguardando revisão da spec
**Data:** 2026-10-12

## Problema

O ciclo hoje é um rótulo de mês do calendário (`cycles.reference_month`). Onde
uma parcela cai depende do mês da compra e de o botão "Virar Ciclo" já ter sido
apertado (`User#next_open_cycle_month`). Isso só funciona quando a virada
acontece exatamente no dia do recebimento; virada adiantada ou atrasada joga
compras no ciclo errado. Além disso:

- `Cycles::CloseService` nunca grava `total_income` (os 4 ciclos fechados
  existentes têm renda 0).
- `cards.best_day` é obrigatório no cadastro de compra, mas não entra em
  nenhum cálculo desde o commit "Always place first installment on the
  purchase month".
- Não existe forma de cancelar ou antecipar parcelas de uma compra que já
  tem parcela em ciclo fechado.
- Compra de outra pessoa é tratada com o "olho" (`excluded_from_summary`),
  sem nome nem controle de devolução.

## Como o usuário trabalha (fonte das regras)

- Usa o app 1 ou 2 vezes por mês, quase sempre **na virada**.
- No dia em que recebe, lança tudo o que falta, confere cada cartão com o app
  do banco, marca contas e cartões como pagos e **só então vira**.
- Paga **tudo** na virada: a fatura fechada **e** o que já passou no cartão
  depois do fechamento. O fechamento do cartão não define nada para ele.
- Paga todas as contas fixas na virada, mesmo as que vencem depois.
- O dia do recebimento varia; ele vira antes, no dia ou depois.
- Parcela é paga uma por virada; às vezes quita o restante de uma vez.
- O "a receber" que ele digita é menor que a renda real (a diferença vai para
  investimento) e isso deve continuar assim.
- Existem duas contas no app; as duas seguem as mesmas regras.

## Decisões chave

- **Ciclo é um período real**, numerado por usuário (1, 2, 3…), que começa numa
  virada e termina na seguinte. Sempre existe exatamente **um ciclo aberto**
  por usuário.
- **Toda compra lançada entra no ciclo aberto.** A data da compra
  (`purchased_on`) é só informativa.
- **Parcela k cai no ciclo `aberto + (k - 1 - pagas)`.** Cada parcela guarda
  o número do ciclo (`cycle_number`); ciclos futuros não precisam existir.
- **Conta fixa aparece uma vez por ciclo**; parceladas avançam um ciclo por vez.
- **Renda é um valor por ciclo** (`cycles.expected_income`), gravado no
  fechamento.
- **Virada vira um checklist** (tela própria) que avisa pendências, mas não
  bloqueia.
- **Ciclo fechado é imutável** (mantém o concern `Closable`).
- Fechamento e vencimento do cartão viram **só informação** (opcionais).

## Modelo de dados

### `cycles`
| coluna | mudança |
|---|---|
| `number` (int, not null) | novo; único por `user_id` |
| `started_at` (datetime, not null) | novo; momento da virada anterior |
| `closed_at` | já existe; `NULL` = ciclo aberto |
| `expected_income` (decimal, default 0) | novo; o "a receber" do ciclo |
| `total_income`, `total_own_cards`, `total_third_party`, `total_fixed_expenses` | retrato gravado na virada (`total_income` já existe; os outros são novos) |
| `total_expenses` | removida (substituída pelas colunas acima) |
| `reference_month` | removida após a conversão |

Índice parcial único: um ciclo aberto por usuário
(`unique (user_id) where closed_at is null`).

Rótulo na tela: `dd/mmm → dd/mmm` (fechado) ou `desde dd/mmm` (aberto).

### `installments`
| coluna | mudança |
|---|---|
| `cycle_number` (int, not null) | novo; substitui `due_month` |
| `cycle_id` | mantém; preenchido na virada (continua sendo o "fechado?" do `Closable`) |
| `original_cycle_number` (int, null) | novo; preenchido quando a parcela é antecipada ("quitar o restante"), para permitir desfazer |
| `reimbursed_at` (datetime, null) | novo; devolução da parcela por terceiro |
| `due_month` | removida após a conversão |

### `card_purchases`
| coluna | mudança |
|---|---|
| `third_party_name` (text, null) | novo; preenchido = compra de outra pessoa |
| `cancelled_at` (datetime, null) | novo; marca "restante cancelado" para exibição |
| `excluded_from_summary` | removida após a conversão |

### `fixed_expenses` / `fixed_expense_payments`
- `fixed_expenses.start_month` → `start_cycle_number` (int). A parcela atual de
  uma conta fixa parcelada passa a ser
  `installments_paid + (cycle_number - start_cycle_number) + 1`.
- `fixed_expense_payments.reference_month` → `cycle_number` (int); único por
  `(fixed_expense_id, cycle_number)`. `cycle_id` continua sendo preenchido na
  virada.
- `fixed_expense_payments.amount` passa a aceitar **0** ("não houve neste
  ciclo").

### `cycle_card_checks` (nova)
`cycle_id`, `card_id`, `checked_at`; único por `(cycle_id, card_id)`. Guarda o
"conferido ✓" de cada cartão no ciclo.

### `incomes`
Removida. O valor do mês aberto vai para `cycles.expected_income`; os dos meses
fechados vão para `cycles.total_income`.

### `cards`
`best_day` e `pay_day` continuam existindo e aparecendo, mas deixam de ser
obrigatórios para lançar compra (`CardPurchaseForm#card_must_have_best_day`
sai).

## Regras e serviços

### Lançar compra (`CardPurchaseForm`)
- Ciclo aberto `n`; parcelas pagas `p`; total `t`.
- Cria as parcelas `p+1 … t` com `cycle_number = n, n+1, …`.
- `purchased_on` default hoje, sem efeito no cálculo. O campo
  `next_due_month` sai.
- Aceita `third_party_name`.

### Editar / apagar compra
Iguais a hoje (`Purchases::UpdateService` / `DestroyService`), trocando
`due_month` por `cycle_number`. Só permitidos se nenhuma parcela está em ciclo
fechado.

### Quitar o restante (`Purchases::PrepayService`)
- Parcelas com `cycle_number > n` passam para `n`; o valor anterior vai para
  `original_cycle_number`.
- **Desfazer** (`Purchases::UndoPrepayService`): permitido enquanto o ciclo `n`
  estiver aberto; devolve `cycle_number = original_cycle_number` e limpa a
  coluna.

### Cancelar o restante (`Purchases::CancelRemainingService`)
- Recebe `from_number` (sugestão: a primeira parcela fora de ciclo fechado).
  Recusa se `from_number` aponta para parcela em ciclo fechado.
- Apaga as parcelas `>= from_number`, ajusta `installments_count` e
  `total_amount` para a soma das parcelas que ficaram e marca `cancelled_at`.
  Precisa respeitar a check `installments_paid < installments_count`.

### Compra de outra pessoa
- `third_party_name` preenchido. Soma no total do cartão (para bater com a
  fatura), mas fica fora de "seus cartões" no resumo e aparece na linha "de
  outras pessoas".
- Pode ser marcado ou desmarcado mesmo com parcela em ciclo fechado. O retrato
  dos ciclos fechados não muda.
- **Me devem**: parcelas de compras de terceiros com `cycle_number <= n` e
  `reimbursed_at IS NULL`, agrupadas por nome (comparação sem diferenciar
  maiúsculas e acentos). "Devolveu" marca `reimbursed_at` em uma parcela ou em
  todas as pendentes da pessoa.
- O formulário sugere nomes já usados (autocomplete).

### Virada (`Cycles::TurnService`, substitui `CloseService`)
Numa transação, com lock na linha do usuário:
1. Confirma que o ciclo recebido ainda é o aberto (senão: "ciclo já virado").
2. Grava o retrato: `total_income = expected_income`, `total_own_cards`,
   `total_third_party`, `total_fixed_expenses`.
3. Preenche `cycle_id` nas parcelas e pagamentos de contas fixas com
   `cycle_number = n`.
4. `closed_at = agora`.
5. Cria o ciclo `n+1` com `started_at = agora` e
   `expected_income = expected_income` do ciclo `n`.
6. Gera os pagamentos de contas fixas do ciclo `n+1`.

Não exige que tudo esteja marcado: a tela avisa as pendências e pede
confirmação.

### Desfazer a última virada (`Cycles::UndoTurnService`)
Permitido só se o ciclo aberto `n+1` está **intocado**:
- nenhuma compra criada depois do `started_at`;
- nenhum pagamento de conta fixa marcado como pago;
- nenhum cartão conferido;
- nenhuma parcela antecipada para `n+1`.

Ação: apaga os pagamentos de `n+1` e o ciclo `n+1`, limpa `cycle_id` das
parcelas e pagamentos de `n`, limpa o retrato e o `closed_at` de `n`.

### Contas fixas por ciclo (`FixedExpenses::EnsurePaymentsForCycle`)
Substitui `EnsurePaymentsForMonth`, com a mesma lógica idempotente, trocando
mês por número de ciclo. Roda ao abrir um ciclo e ao consultar o ciclo aberto.

### Prévia dos próximos ciclos (`Cycles::Projection`)
Para os próximos 6 números de ciclo: soma das parcelas (suas / de terceiros),
contas fixas que se aplicam (pelo valor cadastrado), renda prevista (a do
ciclo aberto) e sobra prevista. Só leitura, nada é gravado.

## API (JSON, sob `/api`)

| rota | uso |
|---|---|
| `GET cycles` | ciclo aberto, ciclos fechados (com retrato) e prévia |
| `PATCH cycles/current` | `expected_income` |
| `POST cycles/current/turn` | virar (recebe o id do ciclo aberto) |
| `POST cycles/last/undo` | desfazer a última virada |
| `PUT` / `DELETE cycles/current/cards/:card_id/check` | conferido ✓ |
| `GET cards/:card_id/installments?cycle=N` | substitui `?month=` |
| `POST cards/:card_id/purchases/:id/prepay` / `DELETE …/prepay` | quitar o restante / desfazer |
| `POST cards/:card_id/purchases/:id/cancel_remaining` | `from_number` |
| `PATCH cards/:card_id/purchases/:id/third_party` | substitui `toggle_excluded` |
| `GET debts` / `POST debts/reimburse` | "Me devem" / devolução |

Saem: `GET/PUT incomes`, `POST cycles/close`, `PATCH …/toggle_excluded`.

## Telas

### Principal (`/dashboard?cycle=N`)
- Mantém o grid de cartões e a lateral.
- As setas navegam por **ciclo**:
  - fechados: só leitura;
  - aberto: editável;
  - próximo: prévia (parcelas, contas, renda prevista).
- No cartão:
  - "Mês" vira **"Neste ciclo"** e "Total aberto" vira **"Parcelas futuras"**;
  - entra o **conferido ✓**;
  - compra de terceiro mostra a etiqueta com o nome;
  - as ações de cada compra viram um menu (editar, apagar, quitar o restante,
    cancelar o restante, de outra pessoa);
  - o limite de 10 itens ganha **"ver todas"**.
- Lateral:
  - resumo = a receber − seus cartões − contas fixas = **sobra**, mais a linha
    informativa "de outras pessoas";
  - o bloco de contas fixas continua;
  - entra o bloco **"Me devem"** (só aparece quando há valor pendente).
- O menu de ações por compra vira um controller Stimulus próprio, em vez de
  crescer o `cards_controller.js` (919 linhas).

### Virada (`/dashboard/virada`)
Checklist de cima para baixo:
1. Renda (confirmar ou ajustar).
2. Cartões: total a pagar, "suas compras" / "de outras pessoas", "fecha dia X ·
   vence dia Y", conferido ✓.
3. Contas fixas: pago ✓, "marcar todas", valor ajustável (inclusive 0).
4. Devoluções pendentes (aviso).
5. Resumo e sobra.
6. Botão "Virar ciclo": lista as pendências e pede confirmação.

Depois de virar, mostra "Desfazer a última virada" enquanto for permitido.

### Ciclos (`/ciclos`)
- **Próximos 6 ciclos**: comprometido em parcelas e contas, sobra prevista.
- **Anteriores**: período, renda, seus cartões, de terceiros, contas, sobra.
  Clicar abre o ciclo na principal.

### Acabamentos
- Logo inteiro visível no fundo escuro.
- Textos em português ("Sign out" → "Sair", título "Sign in · FinanSheet" etc.).
- Tour: o passo 3 ("Foco no fechamento") sai e o passo 11 aponta para a tela de
  virada.

## Conversão dos dados existentes

**Antes:** `pg_dump -Fc` do banco e tgz do volume `finansheet_postgres_data_hugo`
em `~/docker-backup-finansheet-2026-10-12/`.

**Ensaio:** a conversão roda primeiro numa **cópia** do banco (restaurada do
dump num banco de ensaio, no mesmo container), com as conferências abaixo. Só
depois roda no banco real, quando o usuário autorizar. Atenção: o container
`app` roda `db:prepare` a cada boot, então **migrations novas não podem ser
colocadas na pasta do app em execução antes do backup e do ensaio**.

**Regras, por usuário:**
- **Ciclos fechados**, ordenados por `reference_month`, recebem os números
  `1..k`:
  - `started_at` = `closed_at` do anterior (o primeiro usa `users.created_at`);
  - `total_income` = `incomes.amount` do mesmo mês (ou 0);
  - `total_own_cards` / `total_third_party` / `total_fixed_expenses`
    calculados das parcelas e pagamentos já vinculados.
- **Ciclo aberto:**
  - número `k+1`;
  - mês de referência = primeiro mês sem ciclo fechado a partir do mês atual
    (mesma regra de `next_open_cycle_month`);
  - `started_at` = último `closed_at` (ou `users.created_at`);
  - `expected_income` = renda daquele mês (ou 0);
  - rendas de outros meses (nem fechados nem o aberto) são descartadas e
    registradas no log.
- **Parcelas:**
  - com `cycle_id` recebem o número daquele ciclo;
  - sem `cycle_id`: `k+1 + max(0, meses entre o mês aberto e due_month)`.
- **Pagamentos de contas fixas:**
  - com ciclo: o número dele;
  - abertos: a mesma conta das parcelas;
  - pagamentos sem ciclo de meses anteriores ao aberto são descartados (nunca
    entraram em total nenhum); a quantidade é registrada no log.
- **Contas fixas parceladas:**
  `start_cycle_number = k+1 + meses entre o mês aberto e start_month` (pode
  ficar ≤ k).
- **Compras com `excluded_from_summary`:**
  - `third_party_name = "Outra pessoa"`;
  - parcelas delas em ciclo fechado recebem `reimbursed_at = closed_at` daquele
    ciclo (suposição confirmada: o que já fechou já foi devolvido).
- **Conferências dentro da migration** (falha = rollback total):
  - para cada ciclo fechado, soma das parcelas + contas = `total_expenses`
    antigo;
  - cada usuário termina com exatamente um ciclo aberto;
  - nenhuma parcela fica sem `cycle_number`.
- A remoção das colunas antigas e da tabela `incomes` fica numa **migration
  separada**, depois da migration de conversão.

## Erros e concorrência
- Virar duas vezes (clique duplo, duas abas): o lock no usuário e o índice
  parcial único garantem um só ciclo aberto; a segunda requisição recebe
  "ciclo já virado".
- Editar, apagar, quitar ou cancelar parcela em ciclo fechado: recusado com
  mensagem clara (`Closable` + checagens nos serviços).
- Desfazer virada com ciclo novo já mexido: recusado, dizendo o que impede.
- Todas as mensagens em português, no padrão `{ errors: [...] }` já usado
  pela API.

## Testes
- **Minitest**, no banco de teste (`<POSTGRES_DB>_test`, separado do banco com
  dados):
  - `CardPurchaseForm` (encaixe das parcelas nos ciclos);
  - `TurnService`, `UndoTurnService`, `PrepayService` / `UndoPrepayService`,
    `CancelRemainingService`;
  - `EnsurePaymentsForCycle`, `Projection`, "Me devem";
  - controllers novos e alterados.
- Os testes existentes (`close_service_test`, `update_service_test`,
  `destroy_service_test`, `card_purchase_form_test`,
  `card_purchases_controller_test`, `incomes_controller_test`) são adaptados
  ou substituídos.
- **Conversão:** validada pelas conferências embutidas na migration e pelo
  ensaio na cópia do banco real.
- **e2e (Playwright):** roda contra o app em execução, que usa o banco com
  dados reais. Por isso continua **só leitura** (abrir páginas e checar que
  renderizam); fluxos que gravam ficam nos testes Rails.
- CI segue passando: brakeman, bundler-audit, importmap audit, rubocop.

## Fora do escopo
- Pluggy / Meu Pluggy (o botão de conexão estava fora do ar em 12/10/2026; a
  ideia fica para depois).
- Controle de investimento ("guardar"): o usuário prefere continuar lançando
  a renda menor.
- Lançamento em lote de compras.
- Landing (`/`), cadastro e login com Google: sem mudanças.
