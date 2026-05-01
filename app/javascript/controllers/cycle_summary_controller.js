import { Controller } from "@hotwired/stimulus"

// Resumo do ciclo na sidebar. Componente independente:
// - Ouve "cycle:summary-update" com { month, monthLabel, expectedIncome,
//   monthClosed, cardLines: [{name, total}] }
// - Renderiza "A receber" + linhas de cartões + Saldo
// - O botão "Definir/Editar" dispatcha "income:edit-request" pro
//   income_controller — não falamos com endpoint nenhum direto
export default class extends Controller {
  static targets = ["root", "lines", "balance", "month"]

  connect() {
    this.state = null
    this.fixedExpensesTotal = 0

    this.onUpdate = (event) => {
      this.state = event.detail ?? null
      this.render()
    }
    // Total de contas fixas chega via fixed_expenses_summary_controller —
    // mantemos o último valor conhecido e re-renderizamos quando muda.
    this.onFixedExpenses = (event) => {
      const eventMonth = event.detail?.month
      if (eventMonth && this.state?.month && eventMonth !== this.state.month) return
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
    if (!this.state || this.state.monthClosed) return
    window.dispatchEvent(new CustomEvent("income:edit-request", {
      detail: { month: this.state.month, amount: this.state.expectedIncome },
    }))
  }

  render() {
    if (!this.state) {
      this.rootTarget.hidden = true
      return
    }

    const { monthLabel, expectedIncome, monthClosed, cardLines } = this.state
    const hasIncome = expectedIncome != null
    const cardsTotal = (cardLines ?? []).reduce((sum, l) => sum + Number(l.total), 0)
    const fixedTotal = Number(this.fixedExpensesTotal ?? 0)
    const balance = (expectedIncome ?? 0) - cardsTotal - fixedTotal

    this.monthTarget.textContent = monthLabel ?? ""

    const incomeAction = hasIncome ? "Editar" : "Definir"
    const incomeValue  = hasIncome ? formatBRL(expectedIncome) : "—"
    const incomeBtn    = monthClosed
      ? `<button type="button" class="sidebar-cycle__action" disabled
                 data-controller="popover"
                 data-popover-text-value="Ciclo fechado — não é possível alterar lançamentos.">${incomeAction}</button>`
      : `<button type="button" class="sidebar-cycle__action"
                 data-action="cycle-summary#openIncome">${incomeAction}</button>`

    const lines = [
      `<li class="sidebar-cycle__line sidebar-cycle__line--income">
         <span class="sidebar-cycle__line-name">A receber</span>
         <span class="sidebar-cycle__value">${incomeValue}</span>
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
