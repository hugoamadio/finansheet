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
