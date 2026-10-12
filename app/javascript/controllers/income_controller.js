import { Controller } from "@hotwired/stimulus"

// Modal de definir/editar o "A receber" do ciclo aberto. Componente independente:
// - Ouve "income:edit-request" (detail: { amount })
// - Salva via PATCH /api/cycles/current { expected_income }
// - Em sucesso, dispatcha "income:changed" ({ amount }) pro cards_controller
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
    this.titleTarget.textContent = detail.amount ? "Editar A receber" : "Definir A receber"
    this.amountInputTarget.value = detail.amount ? String(detail.amount) : ""

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
      const resp = await this.authFetch(`/api/cycles/current`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_income: amount }),
      })

      const data = await resp.json().catch(() => ({}))

      if (!resp.ok) {
        this.showError((data.errors || ["Erro ao salvar"]).join(", "))
        return
      }

      this.dialogTarget.close()
      window.dispatchEvent(new CustomEvent("income:changed", {
        detail: { amount: data.cycle?.expected_income ?? amount },
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
