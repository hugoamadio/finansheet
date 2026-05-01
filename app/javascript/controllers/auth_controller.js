import { Controller } from "@hotwired/stimulus"

// Contexto global de autenticação.
// Anexado ao <body data-controller="auth"> — roda em TODA página.
//
// Regras:
//   1. Sem token em localStorage         → redireciona pra /login (exceto se já estiver lá)
//   2. Token + user cacheado             → expõe em window.currentUser + valida em background
//   3. Token sem cache                   → busca em /me, cacheia, expõe
//   4. /me responde 401 a qualquer hora  → limpa localStorage + redireciona pra /login
//   5. Estando em /login já autenticado  → manda pra /dashboard
//
// Importante: a landing pública em "/" usa o layout "marketing", que
// NÃO monta esse controller — visitantes sem token não são empurrados
// pra /login lá. Esse controller só vive em páginas autenticadas + /login.
export default class extends Controller {
  static TOKEN_KEY = "auth_token"
  static USER_KEY  = "current_user"
  static LOGIN_PATH = "/login"
  static HOME_PATH  = "/dashboard"

  connect() {
    this.bootstrap().catch((err) => console.error("[auth] bootstrap failed", err))
  }

  async bootstrap() {
    const token = this.readToken()
    const onLogin = window.location.pathname === this.constructor.LOGIN_PATH

    if (!token) {
      if (!onLogin) this.redirect(this.constructor.LOGIN_PATH)
      return
    }

    const cached = this.readCachedUser()
    if (cached) {
      this.exposeUser(cached)
      if (onLogin) {
        this.redirect(this.constructor.HOME_PATH)
        return
      }
      this.validateInBackground(token)
      return
    }

    // Tem token mas nenhum cache — buscar user.
    const user = await this.fetchCurrentUser(token)
    if (!user) {
      this.clearAndRedirect()
      return
    }
    this.exposeUser(user)
    this.cacheUser(user)
    if (onLogin) this.redirect(this.constructor.HOME_PATH)
  }

  async fetchCurrentUser(token) {
    try {
      const resp = await fetch("/me", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json"
        }
      })
      if (!resp.ok) return null
      const data = await resp.json()
      return data.user ?? null
    } catch (err) {
      console.error("[auth] /me failed", err)
      return null
    }
  }

  async validateInBackground(token) {
    const user = await this.fetchCurrentUser(token)
    if (!user) {
      this.clearAndRedirect()
    } else {
      this.exposeUser(user)
      this.cacheUser(user)
    }
  }

  exposeUser(user) {
    window.currentUser = user
    // Evento global pra qualquer controller/JS reagir se quiser.
    window.dispatchEvent(new CustomEvent("auth:user", { detail: user }))
  }

  cacheUser(user) {
    localStorage.setItem(this.constructor.USER_KEY, JSON.stringify(user))
  }

  readToken() {
    return localStorage.getItem(this.constructor.TOKEN_KEY)
  }

  readCachedUser() {
    try {
      const raw = localStorage.getItem(this.constructor.USER_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  clearAndRedirect() {
    localStorage.removeItem(this.constructor.TOKEN_KEY)
    localStorage.removeItem(this.constructor.USER_KEY)
    window.currentUser = null
    this.redirect(this.constructor.LOGIN_PATH)
  }

  redirect(path) {
    if (window.location.pathname !== path) window.location.href = path
  }
}
