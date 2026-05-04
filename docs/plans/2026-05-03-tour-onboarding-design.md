# Tour de onboarding — design

**Status:** aprovado, pronto pra implementação
**Data:** 2026-05-03

## Decisões chave

- **Persistência no DB** (`users.tour_completed_at`, `users.tour_skipped_at`).
  Estado cross-device. Permite "Refazer tour" futuro via settings.
- **Driver.js** via importmap. ~5KB, scroll/overlay/posicionamento prontos.
- **Disparo automático** quando `auth:user` chega com `tour_completed_at` e
  `tour_skipped_at` ambos nulos, na rota `/dashboard`.
- **Backfill** marca todos users existentes como skipped — tour só roda em
  contas criadas após o deploy.

## Sequência de passos

1. **Salário** — abre `salary_setup_modal`, aponta input "Dia que recebe".
   Avança quando user salva (próximo `auth:user` com `salary_day`).
2. **Cadastrar cartão** — aponta "+ Novo cartão". Avança quando dialog abre.
3. **Foco no fechamento** — aponta input `best_day` no modal. Avança no
   evento `card:created`.
4. **Cartão criado** — aponta `card-item` recém-renderizado. Botão "Próximo".
5. **Lançar compra** — aponta botão "Lançar compra". Avança no dialog open.
5b. **Form de compra** — explica os campos. Botão "Próximo".
6. **Compra lançada** — aponta a parcela na lista. Avança no
   evento `purchase:created`.
7. **Contas Fixas** — aponta "Ver detalhes" da sidebar. Avança no dialog open.
8. **Nova conta fixa** — dentro do modal, aponta "+ Nova conta fixa".
   Avança no evento `fixed-expense:created`.
9. **Fechar modal** — "Pode fechar". Avança no dialog close.
10. **Resumo do ciclo** — aponta `.sidebar-cycle`. Botão "Próximo".
11. **Virar Ciclo** — aponta botão verde no header. Botão "Concluir tour".

## Eventos custom adicionados

Pra desacoplar tour da lógica dos controllers existentes:

- `card:created` em `cards_controller.js`.
- `purchase:created` em `cards_controller.js` (granularidade maior que
  `purchase:changed`, que já existe).
- `fixed-expense:created` em `fixed_expenses_modal_controller.js`.
- Dialog open/close detectados via `MutationObserver` no próprio
  `tour_controller`, sem tocar nos controllers existentes.

## Backend

**Migration `add_tour_to_users.rb`**
```ruby
add_column :users, :tour_completed_at, :datetime
add_column :users, :tour_skipped_at,   :datetime
User.update_all(tour_skipped_at: Time.current)  # backfill
```

**Routes**
```ruby
patch "me/tour" => "auth#update_tour"
```

**`AuthController#update_tour`**
- `status: "completed"` → grava `tour_completed_at = Time.current`.
- `status: "skipped"` → grava `tour_skipped_at = Time.current`.
- Outros valores → 422.
- `serialize` expõe os dois campos pro frontend cachear.

## Frontend

**Importmap**
```ruby
pin "driver.js", to: "https://ga.jspm.io/npm:driver.js@1.3.1/dist/driver.js.iife.js"
```

**`tour_controller.js`** (novo, montado no body do layout `application`)
- Ouve `auth:user` → checa flags + path → inicia tour.
- Define array de 11 steps com `element`, `popover.title/description`, e
  hooks pra sincronizar com eventos da app.
- Driver instance com `allowClose: false`, `showProgress: true`,
  `onCloseClick` → fluxo de skip controlado.

**`tour.css`** (novo)
- Sobrescreve classes da Driver.js (`.driver-popover` etc.) com paleta da
  app.
- Mobile: `max-width: min(320px, 90vw)`, font 0.95rem, botão "Pular tour"
  como link discreto.

## Tratamento de modais

Driver.js cria overlay próprio. Em passos dentro de `<dialog>`, o overlay
do Driver é desativado (`overlayOpacity: 0`) e o `dialog::backdrop` cumpre
o papel — evita "duplo escurecimento".

## Edge cases

- **User fecha aba no meio**: flags continuam nulas → tour reinicia do
  passo 1 no próximo login. Aceitável.
- **User fecha modal antes do tour avançar**: tour detecta e mostra
  confirm "Continuar tour?" com [Continuar / Pular].
- **Falha de rede ao salvar progresso**: tour conclui visualmente;
  re-tenta no próximo `auth:user`. Não bloqueia.
- **Mobile + drawer fechado** (passo 7): tour abre o drawer
  programaticamente (`.sidebar.is-open`) antes do highlight.
