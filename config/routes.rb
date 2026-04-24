Rails.application.routes.draw do
  # Health check — returns 200 se Rails bootou sem exceções.
  get "up" => "rails/health#show", as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # Auth
  get  "login" => "logins#new",   as: :login
  post "auth"  => "auth#create",  as: :auth
  get  "me"    => "auth#show",    as: :me

  # App
  root "home#index"
end
