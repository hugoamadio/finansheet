import { Controller } from "@hotwired/stimulus"

// Contexto global de autenticação.
// Anexado ao <body data-controller="auth"> — roda em TODA página.
//
// Regras:
//   1. Sem token em localStorage         → redireciona pra /login (exceto se já estiver numa página pública de auth)
//   2. Token + user cacheado             → expõe em window.currentUser + valida em background
//   3. Token sem cache                   → busca em /me, cacheia, expõe
//   4. /me responde 401 a qualquer hora  → limpa localStorage + redireciona pra /login
//   5. Já autenticado em /login ou /signup → manda pra /dashboard
//
// Páginas públicas de auth (login + signup) usam o mesmo layout `auth`,
// que monta esse controller. Pra elas não rola redirect-pra-login quando
// não tem token (senão o user nunca veria a tela de cadastro).
//
// A landing em "/" usa o layout "marketing" (sem esse controller), então
// segue 100% pública independentemente do estado de auth.
export default class extends Controller {
  static TOKEN_KEY = "auth_token"
  static USER_KEY  = "current_user"
  static LOGIN_PATH  = "/login"
  static SIGNUP_PATH = "/signup"
  static HOME_PATH   = "/dashboard"
  static AUTH_PATHS  = ["/login", "/signup"]

  connect() {
    this.bootstrap().catch((err) => console.error("[auth] bootstrap failed", err))
  }

  async bootstrap() {
    // OAuth callback redireciona pra /dashboard?token=… — capturamos antes
    // de qualquer outra coisa, salvamos no localStorage e limpamos a URL
    // pra não vazar o token em logs/Referer/histórico.
    this.maybeCaptureTokenFromUrl()

    const token = this.readToken()
    const onAuthPage = this.constructor.AUTH_PATHS.includes(window.location.pathname)

    if (!token) {
      if (!onAuthPage) this.redirect(this.constructor.LOGIN_PATH)
      return
    }

    const cached = this.readCachedUser()
    if (cached) {
      this.exposeUser(cached)
      if (onAuthPage) {
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
    if (onAuthPage) this.redirect(this.constructor.HOME_PATH)
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

  // Captura ?token=… deixado pelo OmniauthCallbacksController após login
  // bem-sucedido com Google. Salva em localStorage, invalida cache de user
  // (force re-fetch via /me na sequência), e limpa o param da URL.
  maybeCaptureTokenFromUrl() {
    const params = new URLSearchParams(window.location.search)
    const incoming = params.get("token")
    if (!incoming) return

    localStorage.setItem(this.constructor.TOKEN_KEY, incoming)
    localStorage.removeItem(this.constructor.USER_KEY)

    params.delete("token")
    const cleanQuery = params.toString()
    const newUrl = window.location.pathname + (cleanQuery ? `?${cleanQuery}` : "") + window.location.hash
    window.history.replaceState({}, "", newUrl)
  }
}
