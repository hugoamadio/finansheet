import { Controller } from "@hotwired/stimulus"

// Modal de definir/editar o "A receber" do mês. Componente independente:
// - Ouve "income:edit-request" (detail: { month: "YYYY-MM-DD", amount: number|null })
// - Possui SEU endpoint (PUT /api/incomes — upsert por reference_month)
// - Em sucesso, dispatcha "income:changed" pro cards_controller atualizar
//   a barra de resumo do mês
export default class extends Controller {
  static targets = ["dialog", "form", "title", "amountInput", "submit", "error"]
  static TOKEN_KEY = "auth_token"

  connect() {
    this.onRequest = (event) => this.openWith(event.detail ?? {})
    window.addEventListener("income:edit-request", this.onRequest)
  }

  disconnect() {
    window.removeEventListener("income:edit-request", this.onRequest)
  }

  openWith(detail) {
    if (!detail.month) return

    this.month = detail.month

    this.titleTarget.textContent = detail.amount == null
      ? "Definir A receber"
      : "Editar A receber"

    this.amountInputTarget.value = detail.amount == null ? "" : String(detail.amount)

    this.hideError()
    this.dialogTarget.showModal()
    this.amountInputTarget.focus()
    this.amountInputTarget.select()
  }

  close() {
    this.dialogTarget.close()
  }

  async submit(event) {
    event.preventDefault()
    this.hideError()

    const amount = parseFloat(this.amountInputTarget.value)
    if (!Number.isFinite(amount) || amount < 0) {
      this.showError("Informe um valor maior ou igual a zero.")
      return
    }

    this.setSubmitting(true)
    try {
      const resp = await this.authFetch(`/api/incomes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ income: { reference_month: this.month, amount } }),
      })

      const data = await resp.json().catch(() => ({}))

      if (!resp.ok) {
        this.showError((data.errors || ["Erro ao salvar"]).join(", "))
        return
      }

      this.dialogTarget.close()
      window.dispatchEvent(new CustomEvent("income:changed", {
        detail: { month: this.month, amount: data.amount },
      }))
    } catch (err) {
      console.error("[income] submit failed", err)
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
