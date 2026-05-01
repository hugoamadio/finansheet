class LandingController < ApplicationController
  layout "marketing"

  # Landing comercial pública — acessível sem auth. O layout "marketing"
  # não monta o auth_controller, então usuários sem token não são
  # redirecionados pra /login ao visitar essa página.
  def index
  end
end
