class SignupsController < ApplicationController
  layout "auth", only: :new

  # API JSON-only: signup_form_controller.js chama via fetch, sem token
  # CSRF (mesmo padrão do AuthController, que é API). A view `new` é HTML
  # tradicional e não precisa disso.
  skip_before_action :verify_authenticity_token, only: :create

  # GET /signup → renderiza o formulário com layout `auth` (mesmo do login).
  def new
  end

  # POST /signup → cria User + emite JWT.
  # Body JSON: { email, password, remember_me? }
  # Resposta: { success: true, token: "..." } igual o /auth (login).
  def create
    user = User.new(email: params[:email], password: params[:password])

    if user.save
      token = AuthToken.encode(
        user_id:     user.id,
        remember_me: ActiveModel::Type::Boolean.new.cast(params[:remember_me]),
      )
      render json: { success: true, token: token }, status: :created
    else
      render json: { success: false, errors: user.errors.full_messages },
             status: :unprocessable_entity
    end
  end
end
