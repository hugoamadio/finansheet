import { Controller } from "@hotwired/stimulus"

// Resumo de Contas Fixas na sidebar. Componente independente:
// - Faz suas próprias requests (GET /api/fixed_expenses?month=...)
// - Sincroniza com o mês visualizado ouvindo "cycle:summary-update"
// - Botão "Ver detalhes" dispatcha "fixed-expenses:open-request" → modal
// - Ouve "fixed-expenses:changed" emitido pelo modal pra atualizar
//   totais sem refetch (modal já tem o estado autoritativo após mutação)
//
// Quando emite "cycle:fixed-expenses-update" → cycle_summary_controller
// agrega no saldo da sidebar.
export default class extends Controller {
  static targets = ["root", "total", "paid", "pending", "pendingRow"]

  connect() {
    this.month = null

    this.onMonthChange = (event) => {
      const month = event.detail?.month
      if (!month || month === this.month) return
      this.month = month
      this.fetchSummary()
    }
    this.onChanged = (event) => {
      // Modal acabou de mutar algo no MESMO mês — usa o detail direto.
      if (!event.detail || event.detail.month !== this.month) return
      this.applyTotals(event.detail)
    }

    window.addEventListener("cycle:summary-update",   this.onMonthChange)
    window.addEventListener("fixed-expenses:changed", this.onChanged)
  }

  disconnect() {
    window.removeEventListener("cycle:summary-update",   this.onMonthChange)
    window.removeEventListener("fixed-expenses:changed", this.onChanged)
  }

  // Click "Ver detalhes" → abre modal e passa o mês corrente.
  openModal() {
    if (!this.month) return
    window.dispatchEvent(new CustomEvent("fixed-expenses:open-request", {
      detail: { month: this.month },
    }))
  }

  async fetchSummary() {
    try {
      const resp = await this.authFetch(`/api/fixed_expenses?month=${this.month}`)
      if (!resp.ok) throw new Error(`GET /api/fixed_expenses falhou: ${resp.status}`)
      const data = await resp.json()
      this.applyTotals({
        month:        this.month,
        total:        data.total,
        paidTotal:    data.paid_total,
        pendingTotal: data.pending_total,
      })
    } catch (err) {
      console.error("[fixed-expenses-summary] fetch failed", err)
      this.rootTarget.hidden = true
    }
  }

  applyTotals({ total, paidTotal, pendingTotal }) {
    const t = Number(total ?? 0)
    const p = Number(paidTotal ?? 0)
    const pend = Number(pendingTotal ?? (t - p))

    this.totalTarget.textContent   = formatBRL(t)
    this.paidTarget.textContent    = formatBRL(p)
    this.pendingTarget.textContent = formatBRL(pend)
    this.pendingRowTarget.hidden   = pend <= 0

    // Mostra a seção mesmo quando total=0? Mostro sempre — o botão "Ver
    // detalhes" permite cadastrar a primeira conta fixa.
    this.rootTarget.hidden = false

    // Propaga total pra cycle_summary somar no saldo geral.
    window.dispatchEvent(new CustomEvent("cycle:fixed-expenses-update", {
      detail: { month: this.month, total: t },
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
