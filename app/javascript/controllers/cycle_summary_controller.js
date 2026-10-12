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
