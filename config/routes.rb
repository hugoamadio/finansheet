Rails.application.routes.draw do
  # Health check — returns 200 se Rails bootou sem exceções.
  get "up" => "rails/health#show", as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # Auth
  get   "login"  => "logins#new",     as: :login
  post  "auth"   => "auth#create",    as: :auth
  get   "signup" => "signups#new",    as: :new_signup
  post  "signup" => "signups#create", as: :signup
  get   "me"      => "auth#show",        as: :me
  patch "me"      => "auth#update"
  patch "me/tour" => "auth#update_tour", as: :update_tour

  # OmniAuth — Google OAuth2.
  # GET /auth/:provider/callback é o endpoint pra onde o Google redireciona
  # após o usuário autorizar. Não conflita com POST /auth (login) — método
  # e path são diferentes. A request inicial /auth/google_oauth2 é montada
  # pelo middleware OmniAuth, não precisa de rota explícita.
  get "/auth/:provider/callback" => "omniauth_callbacks#callback", as: :omniauth_callback
  get "/auth/failure"            => "omniauth_callbacks#failure",  as: :omniauth_failure

  # API JSON (chamada via fetch após render)
  scope :api, defaults: { format: :json } do
    resources :cards, only: [:index, :create, :update, :destroy] do
      resources :purchases,    only: [:create, :update, :destroy], controller: "card_purchases" do
        member { patch :third_party }
      end
      resources :installments, only: [:index],                     controller: "card_installments"
    end


    get   "cycles"              => "cycles#index"
    patch "cycles/current"      => "cycles#update_current"
    post  "cycles/current/turn" => "cycles#turn"

    resources :fixed_expenses, only: [:index, :create, :update, :destroy]
    resources :fixed_expense_payments, only: [:update]
  end

  # App
  get "dashboard" => "home#index", as: :dashboard

  # Landing comercial pública — fica em / pra ser a primeira impressão
  # quando alguém chega no domínio sem estar logado.
  root "landing#index"
end
