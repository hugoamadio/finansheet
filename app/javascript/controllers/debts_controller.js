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
