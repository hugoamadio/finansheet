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
