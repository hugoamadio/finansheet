import { Controller } from "@hotwired/stimulus"

// Modal de setup do dia de recebimento (salary_day).
//
// Responsabilidades:
//   - Decidir QUANDO abrir: ouve `auth:user` (disparado pelo auth_controller)
//     e abre se `user.salary_day` E `user.salary_on_last_day` estiverem vazios.
//   - Bloquear: <dialog> sem botão de fechar e cancela ESC (showModal + cancel handler).
//   - Chamar PATCH /me com o que o usuário escolheu.
//   - Atualizar `window.currentUser` + cache do localStorage e re-emitir
//     `auth:user` pra que sidebar (e qualquer outro listener) atualize.
export default class extends Controller {
  static targets = ["dialog", "form", "modeFixed", "modeLast", "dayWrapper", "dayInput", "submit", "error"]
  static USER_KEY  = "current_user"
  static TOKEN_KEY = "auth_token"

  connect() {
    this.onUserEvent = (event) => this.maybeOpen(event.detail ?? window.currentUser)
    window.addEventListener("auth:user", this.onUserEvent)

    // Caso o auth_controller já tenha hidratado currentUser antes da gente conectar.
    if (window.currentUser) this.maybeOpen(window.currentUser)
  }

  disconnect() {
    window.removeEventListener("auth:user", this.onUserEvent)
  }

  maybeOpen(user) {
    if (!user) return
    if (user.salary_day != null || user.salary_on_last_day === true) return
    this.openIfClosed()
  }

  openIfClosed() {
    if (!this.dialogTarget.open) {
      this.applyMode("fixed")
      this.dialogTarget.showModal()
    }
  }

  // ESC dispara o evento "cancel" no <dialog>; bloqueamos pra não fechar.
  preventClose(event) {
    event.preventDefault()
  }

  modeChanged() {
    this.applyMode(this.modeFixedTarget.checked ? "fixed" : "last")
  }

  applyMode(mode) {
    const isFixed = mode === "fixed"
    this.dayWrapperTarget.hidden  = !isFixed
    this.dayInputTarget.disabled  = !isFixed
    this.dayInputTarget.required  = isFixed
    if (!isFixed) this.dayInputTarget.value = ""
  }

  async submit(event) {
    event.preventDefault()
    this.hideError()

    const isFixed = this.modeFixedTarget.checked
    const dayRaw  = this.dayInputTarget.value.trim()
    const day     = isFixed ? parseInt(dayRaw, 10) : null

    if (isFixed && (!Number.isFinite(day) || day < 1 || day > 31)) {
      this.showError("Informe um dia entre 1 e 31.")
      return
    }

    const payload = {
      user: {
        salary_day:         isFixed ? day : "",
        salary_on_last_day: !isFixed,
      },
    }

    this.setSubmitting(true)
    try {
      const resp = await this.authFetch("/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await resp.json().catch(() => ({}))

      if (!resp.ok) {
        this.showError((data.errors || ["Erro ao salvar"]).join(", "))
        return
      }

      // Sucesso: atualiza estado global + cache + emite evento pra sidebar
      window.currentUser = data.user
      localStorage.setItem(this.constructor.USER_KEY, JSON.stringify(data.user))
      window.dispatchEvent(new CustomEvent("auth:user", { detail: data.user }))

      this.dialogTarget.close()
    } catch (err) {
      console.error("[salary-setup] submit failed", err)
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
