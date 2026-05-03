# Auth — Cadastro tradicional + Login com Google (OAuth)

**Status:** aprovado, pronto pra implementação
**Data:** 2026-05-01

## Decisão chave

Quando o usuário entra com Google usando email que já tem cadastro com senha,
**linka automaticamente**: o User existente ganha `provider="google"` + `uid`,
e a partir daí pode entrar pelos dois métodos com o mesmo email.

Cadastro fica em **rota separada `/signup`** (mantém `/login` simples).

## Arquitetura geral

```
┌─────────────────────────────────────────────────────────────┐
│  /signup ──┐                                                 │
│  /login ───┼──→ form email/senha ──→ POST /signup ou /auth   │
│            │                            └─→ JWT → /dashboard │
│            │                                                 │
│            └─→ botão "Entrar com Google" ──→                 │
│                  POST /auth/google_oauth2 ──→ Google ──→     │
│                  GET /auth/google_oauth2/callback ──→        │
│                    User.from_omniauth (linka ou cria) ──→    │
│                    JWT → /dashboard?token=…                  │
└─────────────────────────────────────────────────────────────┘
```

## Fase A — Cadastro tradicional (email/senha)

### Backend

**`app/models/user.rb`**
- Trocar `has_secure_password` por `has_secure_password validations: false`.
- Validações próprias:
  - `validates :password, length: { minimum: 8 }, if: -> { password.present? }`
  - `validates :password, presence: true, on: :create, unless: -> { provider.present? }`
  - (a 2ª linha funciona mesmo antes da coluna `provider` existir — `unless` ignora silenciosamente.)

**`config/routes.rb`**
- `post "signup" => "signups#create", as: :signup`
- `get  "signup" => "signups#new",    as: :new_signup`

**`app/controllers/signups_controller.rb`** (novo)
- Herda de `ApplicationController`, `layout "auth", only: :new`.
- `create`: cria User, emite JWT (`AuthToken.encode`), retorna `{success, token}` igual o `/auth`.

### Frontend

- **`app/views/signups/new.html.erb`** — clone do login, textos diferentes:
  título "Criar conta", botão "Cadastrar", link inferior "Já tem conta? Entrar".
- **`app/javascript/controllers/signup_form_controller.js`** — clone do
  login_form_controller, URL `/signup`. Pós-sucesso: salva token + redireciona pra `/dashboard`.
- **View do `/login`** — link inferior "Não tem conta? Criar conta" → `/signup`.

### Não muda
- `AuthController` (login com senha).
- `auth_controller.js` (Stimulus do body).
- Layouts (`auth.html.erb` reusado).

## Fase B — Google OAuth

### Backend

**Migration `add_oauth_to_users.rb`**
```ruby
add_column :users, :provider, :string
add_column :users, :uid,      :string
add_index  :users, [:provider, :uid], unique: true,
           where: "provider IS NOT NULL", name: "idx_users_provider_uid"
```

**Gemfile**
```ruby
gem "omniauth"
gem "omniauth-google-oauth2"
gem "omniauth-rails_csrf_protection"
```

**`config/initializers/omniauth.rb`**
```ruby
Rails.application.config.middleware.use OmniAuth::Builder do
  provider :google_oauth2,
           ENV["GOOGLE_CLIENT_ID"],
           ENV["GOOGLE_CLIENT_SECRET"],
           scope: "email,profile",
           prompt: "select_account"
end
OmniAuth.config.allowed_request_methods = [:post]
```

**`.env`**
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

**`User.from_omniauth(auth)`** (no model)
1. `find_by(provider: auth.provider, uid: auth.uid)` → se achar, retorna.
2. Senão, `find_by(email: auth.info.email)` → se achar, **linka** (atualiza
   provider/uid) e retorna.
3. Senão, cria User com email + provider + uid (sem senha — permitido pelo
   `has_secure_password validations: false`).

**Routes**
```ruby
get "/auth/:provider/callback" => "omniauth_callbacks#callback"
get "/auth/failure"            => "omniauth_callbacks#failure"
```

**`OmniauthCallbacksController`**
- `callback`: chama `User.from_omniauth`, gera JWT, redireciona pra
  `/dashboard?token=…`.
- `failure`: redireciona pra `/login?oauth_error=1`.

### Frontend

- Botão "Entrar com Google" no `/login` E no `/signup`. Mesmo botão, mesmo
  callback — OAuth não distingue cadastro de login.
- `auth_controller.js`: no `bootstrap`, antes de validar token, captura
  `?token=` da URL → salva em localStorage → limpa URL via
  `history.replaceState`.
- `/login` mostra erro inline se URL tem `?oauth_error=1`.

## Passo a passo no Google Cloud Console (depois)

1. Criar projeto `finansheet`.
2. OAuth consent screen → External → preencher app name, email de suporte,
   scopes (`userinfo.email` + `userinfo.profile`), test users (seu email).
3. Credentials → Create OAuth Client ID → Web app:
   - Authorized origins: `http://localhost:3000`
   - Authorized redirect URIs: `http://localhost:3000/auth/google_oauth2/callback`
4. Copiar Client ID + Secret pro `.env`.
5. `docker compose restart app`.

## Ordem de execução

1. Fase A inteira → testar.
2. Migration `add_oauth_to_users`.
3. Gems + initializer + ENV vars vazias.
4. Routes + `OmniauthCallbacksController` + `User.from_omniauth`.
5. Frontend (botão Google + captura de `?token=`).
6. **Pausa** — código pronto, ENV vars vazias. Botão Google só falha quando
   clicado (Google retorna invalid_client). App funciona normal pra cadastro
   tradicional até o passo 7.
7. Setup no Google Cloud Console + cola credenciais + restart.

## Por que essa ordem é segura

OmniAuth aceita Client ID/Secret nulos no boot — só falha em runtime quando
o user clica. App sobe normal, cadastro tradicional funciona, nada quebra.
