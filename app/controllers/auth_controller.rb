class AuthController < ApiController
  skip_before_action :authenticate!, only: :create

  def create
    user = User.find_by(email: params[:email].to_s.strip.downcase)

    if user&.authenticate(params[:password])
      token = AuthToken.encode(user_id: user.id, remember_me: remember_me_param)
      render json: { success: true, token: token }, status: :ok
    else
      render json: { success: false }, status: :bad_request
    end
  end

  def show
    render json: { success: true, user: { id: current_user.id, email: current_user.email } }, status: :ok
  end

  private

  def remember_me_param
    ActiveModel::Type::Boolean.new.cast(params[:remember_me])
  end
end
