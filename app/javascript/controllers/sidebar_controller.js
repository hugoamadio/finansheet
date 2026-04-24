import { Controller } from "@hotwired/stimulus"

// Controller da sidebar:
//   - Toggle em mobile (hamburger) e backdrop pra fechar clicando fora
//   - Popula avatar + email a partir de window.currentUser
//     (mantido vivo pelo auth_controller, que dispara "auth:user" quando atualiza)
export default class extends Controller {
  static targets = ["avatar", "email"]
  static OPEN_CLASS = "is-open"

  connect() {
    this.onUserEvent = (event) => this.renderUser(event.detail ?? window.currentUser)
    window.addEventListener("auth:user", this.onUserEvent)

    // Caso o auth_controller já tenha hidratado currentUser antes da sidebar conectar.
    this.renderUser(window.currentUser)
  }

  disconnect() {
    window.removeEventListener("auth:user", this.onUserEvent)
  }

  toggle() {
    this.element.classList.toggle(this.constructor.OPEN_CLASS)
  }

  close() {
    this.element.classList.remove(this.constructor.OPEN_CLASS)
  }

  // JWT stateless — logout = limpar localStorage + ir pro /login.
  // Não tem call pro servidor porque não há sessão pra invalidar.
  logout() {
    localStorage.removeItem("auth_token")
    localStorage.removeItem("current_user")
    window.location.href = "/login"
  }

  renderUser(user) {
    if (!user || !user.email) return

    if (this.hasEmailTarget)  this.emailTarget.textContent  = user.email
    if (this.hasAvatarTarget) this.avatarTarget.textContent = initialOf(user.email)
  }
}

function initialOf(email) {
  const str = String(email).trim()
  return str.length ? str.charAt(0).toUpperCase() : "?"
}
