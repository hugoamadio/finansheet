class ApiController < ActionController::API
  before_action :authenticate!

  attr_reader :current_user

  private

  def authenticate!
    payload = bearer_token && AuthToken.decode(bearer_token)
    @current_user = payload && User.find_by(id: payload[:user_id])
    return if @current_user

    render json: { success: false }, status: :unauthorized
  end

  def bearer_token
    header = request.headers["Authorization"].to_s
    return nil unless header.start_with?("Bearer ")

    header.sub("Bearer ", "").strip.presence
  end
end
