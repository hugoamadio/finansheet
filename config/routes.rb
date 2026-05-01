Rails.application.routes.draw do
  # Health check — returns 200 se Rails bootou sem exceções.
  get "up" => "rails/health#show", as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # Auth
  get   "login" => "logins#new",   as: :login
  post  "auth"  => "auth#create",  as: :auth
  get   "me"    => "auth#show",    as: :me
  patch "me"    => "auth#update"

  # API JSON (chamada via fetch após render)
  scope :api, defaults: { format: :json } do
    resources :cards, only: [:index, :create, :update, :destroy] do
      resources :purchases,    only: [:create, :update, :destroy], controller: "card_purchases" do
        member { patch :toggle_excluded }
      end
      resources :installments, only: [:index],                     controller: "card_installments"
    end

    post "cycles/close" => "cycles#close"

    get "incomes" => "incomes#show"
    put "incomes" => "incomes#upsert"

    resources :fixed_expenses, only: [:index, :create, :update, :destroy]
    resources :fixed_expense_payments, only: [:update]
  end

  # App
  root "home#index"
end
