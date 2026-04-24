class AuthController < ActionController::API
  def create
    user = User.find_by(email: params[:email].to_s.strip.downcase)

    if user&.authenticate(params[:password])
      token = AuthToken.encode(
        user_id: user.id,
        remember_me: remember_me_param
      )
      render json: { success: true, token: token }, status: :ok
    else
      render json: { success: false }, status: :bad_request
    end
  end

  def show
    payload = bearer_token && AuthToken.decode(bearer_token)
    user = payload && User.find_by(id: payload[:user_id])

    if user
      render json: { success: true, user: user_json(user) }, status: :ok
    else
      render json: { success: false }, status: :unauthorized
    end
  end

  private

  def user_json(user)
    { id: user.id, email: user.email }
  end

  def bearer_token
    header = request.headers["Authorization"].to_s
    return nil unless header.start_with?("Bearer ")

    header.sub("Bearer ", "").strip.presence
  end

  def remember_me_param
    ActiveModel::Type::Boolean.new.cast(params[:remember_me])
  end
end
