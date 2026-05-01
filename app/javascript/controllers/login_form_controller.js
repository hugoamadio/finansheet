import { Controller } from "@hotwired/stimulus"

// Intercepta submit do form de login e fala com POST /auth.
// Em sucesso: guarda token, limpa cache de user, vai pra /.
// Em falha: mostra mensagem.
export default class extends Controller {
  static targets = ["email", "password", "rememberMe", "error", "submit"]

  async submit(event) {
    event.preventDefault()
    this.clearError()
    this.setLoading(true)

    const payload = {
      email: this.emailTarget.value,
      password: this.passwordTarget.value,
      remember_me: this.rememberMeTarget.checked
    }

    try {
      const resp = await fetch("/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      })

      const data = await resp.json().catch(() => ({}))

      if (resp.ok && data.success && data.token) {
        localStorage.setItem("auth_token", data.token)
        localStorage.removeItem("current_user")
        window.location.href = "/dashboard"
        return
      }

      this.showError("Invalid email or password")
    } catch (err) {
      console.error("[login-form] /auth failed", err)
      this.showError("Unable to reach server. Try again.")
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
    this.submitTarget.textContent = loading ? "Signing in…" : "Sign in"
  }
}
