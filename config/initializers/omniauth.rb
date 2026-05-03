# OmniAuth — providers de OAuth.
#
# Google OAuth2: Client ID/Secret vêm das ENV vars (vazio = botão "Entrar
# com Google" vai falhar com `invalid_client` quando clicado, mas o app sobe
# normal). Configurar em https://console.cloud.google.com → Credentials →
# OAuth Client ID (tipo Web app), com redirect URI:
#   http://localhost:3000/auth/google_oauth2/callback
Rails.application.config.middleware.use OmniAuth::Builder do
  provider :google_oauth2,
           ENV["GOOGLE_CLIENT_ID"],
           ENV["GOOGLE_CLIENT_SECRET"],
           scope:  "email,profile",
           prompt: "select_account"
end

# `omniauth-rails_csrf_protection` exige POST nas rotas /auth/:provider —
# mitiga CSRF redirect attacks. Mantemos o request method default (POST).
OmniAuth.config.allowed_request_methods = [:post]

# Em dev é útil ver o erro real no callback (ex: invalid_client) em vez de
# o OmniAuth engolir e devolver "invalid_credentials" genérico.
OmniAuth.config.on_failure = ->(env) {
  Rails.logger.warn("[omniauth] failure: #{env['omniauth.error.type']} - #{env['omniauth.error']&.message}")
  OmniAuth::FailureEndpoint.call(env)
}
