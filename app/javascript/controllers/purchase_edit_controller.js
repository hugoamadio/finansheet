import { Controller } from "@hotwired/stimulus"

// Modal de edição de uma CardPurchase. Componente independente:
// - Ouve "purchase:edit-request" (event detail traz cardId, purchaseId, etc.)
// - Possui SEU endpoint (PATCH /api/cards/:cardId/purchases/:purchaseId)
// - Em sucesso, dispatcha "purchase:changed" pra cards_controller refrescar
export default class extends Controller {
  static targets = ["dialog", "form", "header", "subheader", "totalInput", "countInput", "preview", "submit", "error"]
  static TOKEN_KEY = "auth_token"

  connect() {
    this.onRequest = (event) => this.openWith(event.detail ?? {})
    window.addEventListener("purchase:edit-request", this.onRequest)
  }

  disconnect() {
    window.removeEventListener("purchase:edit-request", this.onRequest)
  }

  openWith(detail) {
    if (!detail.cardId || !detail.purchaseId) return

    this.cardId     = detail.cardId
    this.purchaseId = detail.purchaseId

    this.headerTarget.textContent    = detail.description || "Editar compra"
    this.subheaderTarget.textContent = `Total atual: ${formatBRL(detail.totalAmount)} · ${detail.installmentsCount}× parcela(s)`

    this.totalInputTarget.value = String(detail.totalAmount ?? "")
    this.countInputTarget.value = String(detail.installmentsCount ?? "1")

    this.hideError()
    this.updatePreview()
    this.dialogTarget.showModal()
    this.totalInputTarget.focus()
    this.totalInputTarget.select()
  }

  close() {
    this.dialogTarget.close()
  }

  updatePreview() {
    const total = parseFloat(this.totalInputTarget.value)
    const count = parseInt(this.countInputTarget.value, 10)

    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(count) || count < 1) {
      this.previewTarget.hidden = true
      return
    }

    const base = Math.floor((total / count) * 100) / 100
    const last = Math.round((total - base * (count - 1)) * 100) / 100
    const splitTxt = base === last
      ? `${count}× ${formatBRL(base)}`
      : `${count - 1}× ${formatBRL(base)} + 1× ${formatBRL(last)}`

    this.previewTarget.innerHTML = `<strong>${splitTxt}</strong> — total ${formatBRL(total)}`
    this.previewTarget.hidden = false
  }

  async submit(event) {
    event.preventDefault()
    this.hideError()

    const total = parseFloat(this.totalInputTarget.value)
    const count = parseInt(this.countInputTarget.value, 10)

    if (!Number.isFinite(total) || total <= 0) {
      this.showError("Informe um valor maior que zero.")
      return
    }
    if (!Number.isFinite(count) || count < 1) {
      this.showError("Informe ao menos 1 parcela.")
      return
    }

    this.setSubmitting(true)
    try {
      const resp = await this.authFetch(
        `/api/cards/${this.cardId}/purchases/${this.purchaseId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchase: { total_amount: total, installments_count: count } }),
        }
      )

      const data = await resp.json().catch(() => ({}))

      if (!resp.ok) {
        this.showError((data.errors || ["Erro ao salvar"]).join(", "))
        return
      }

      this.dialogTarget.close()
      window.dispatchEvent(new CustomEvent("purchase:changed", {
        detail: { cardId: this.cardId, purchaseId: this.purchaseId },
      }))
    } catch (err) {
      console.error("[purchase-edit] submit failed", err)
      this.showError("Falha de rede. Tente de novo.")
    } finally {
      this.setSubmitting(false)
    }
  }

  setSubmitting(flag) {
    this.submitTarget.disabled = flag
    this.submitTarget.innerHTML = flag
      ? `<span class="spinner"></span> Salvando…`
      : `Salvar`
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
