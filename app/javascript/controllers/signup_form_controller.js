import { Controller } from "@hotwired/stimulus"

// Intercepta submit do form de cadastro e fala com POST /signup.
// Em sucesso: guarda token, limpa cache de user, vai pra /dashboard.
// Em falha: mostra mensagem com erros do servidor (email duplicado, senha curta etc.).
export default class extends Controller {
  static targets = ["email", "password", "error", "submit"]

  async submit(event) {
    event.preventDefault()
    this.clearError()
    this.setLoading(true)

    const payload = {
      email:    this.emailTarget.value,
      password: this.passwordTarget.value,
    }

    try {
      const resp = await fetch("/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept":       "application/json",
        },
        body: JSON.stringify(payload),
      })

      const data = await resp.json().catch(() => ({}))

      if (resp.ok && data.success && data.token) {
        localStorage.setItem("auth_token", data.token)
        localStorage.removeItem("current_user")
        window.location.href = "/dashboard"
        return
      }

      // Backend devolve `errors: [...]` em 422.
      const msg = (data.errors && data.errors.length)
        ? data.errors.join(". ")
        : "Não foi possível criar a conta. Tente de novo."
      this.showError(msg)
    } catch (err) {
      console.error("[signup-form] /signup failed", err)
      this.showError("Falha ao contatar o servidor. Tente de novo.")
    } finally {
      this.setLoading(false)
    }
  }

  showError(message) {
    this.errorTarget.textContent = message
    this.errorTarget.hidden = false
  }

  clearError() {
    this.errorTarget.textContent = ""
    this.errorTarget.hidden = true
  }

  setLoading(loading) {
    if (!this.hasSubmitTarget) return
    this.submitTarget.disabled = loading
    this.submitTarget.textContent = loading ? "Criando…" : "Cadastrar"
  }
}
