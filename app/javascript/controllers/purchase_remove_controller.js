import { Controller } from "@hotwired/stimulus"

// Modal de confirmação de remoção de uma CardPurchase. Componente independente:
// - Ouve "purchase:remove-request" pra abrir
// - Possui SEU endpoint (DELETE /api/cards/:cardId/purchases/:purchaseId)
// - Em sucesso, dispatcha "purchase:changed"
export default class extends Controller {
  static targets = ["dialog", "summary", "confirm", "error"]
  static TOKEN_KEY = "auth_token"

  connect() {
    this.onRequest = (event) => this.openWith(event.detail ?? {})
    window.addEventListener("purchase:remove-request", this.onRequest)
  }

  disconnect() {
    window.removeEventListener("purchase:remove-request", this.onRequest)
  }

  openWith(detail) {
    if (!detail.cardId || !detail.purchaseId) return

    this.cardId     = detail.cardId
    this.purchaseId = detail.purchaseId

    this.summaryTarget.innerHTML = `
      <div style="font-weight:600;">${escapeHtml(detail.description || "—")}</div>
      <div style="margin-top:0.2rem;color:#475569;">
        ${formatBRL(detail.totalAmount)} em ${detail.installmentsCount}× parcela(s)
      </div>
    `

    this.hideError()
    this.dialogTarget.showModal()
  }

  close() {
    this.dialogTarget.close()
  }

  async confirm() {
    this.hideError()
    this.setSubmitting(true)

    try {
      const resp = await this.authFetch(
        `/api/cards/${this.cardId}/purchases/${this.purchaseId}`,
        { method: "DELETE" }
      )

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        this.showError((data.errors || ["Erro ao remover"]).join(", "))
        return
      }

      this.dialogTarget.close()
      window.dispatchEvent(new CustomEvent("purchase:changed", {
        detail: { cardId: this.cardId, purchaseId: this.purchaseId },
      }))
    } catch (err) {
      console.error("[purchase-remove] confirm failed", err)
      this.showError("Falha de rede. Tente de novo.")
    } finally {
      this.setSubmitting(false)
    }
  }

  setSubmitting(flag) {
    this.confirmTarget.disabled = flag
    this.confirmTarget.innerHTML = flag
      ? `<span class="spinner"></span> Removendo…`
      : `Remover`
  }

  showError(msg) {
    this.errorTarget.textContent = msg
    this.errorTarget.hidden = false
  }

  hideError() {
    this.errorTarget.hidden = true
    this.errorTarget.textContent = ""
  }

  authFetch(url, options = {}) {
    const token = localStorage.getItem(this.constructor.TOKEN_KEY)
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
