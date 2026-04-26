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
    render json: { success: true, user: serialize(current_user) }, status: :ok
  end

  def update
    if current_user.update(salary_params)
      render json: { success: true, user: serialize(current_user) }, status: :ok
    else
      render json: { success: false, errors: current_user.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def serialize(user)
    {
      id:                 user.id,
      email:              user.email,
      salary_day:         user.salary_day,
      salary_on_last_day: user.salary_on_last_day,
    }
  end

  def salary_params
    raw = params.require(:user).permit(:salary_day, :salary_on_last_day)

    # Front pode mandar string vazia pra "limpar" o dia quando marca último dia.
    raw[:salary_day] = nil if raw[:salary_day].blank?
    raw[:salary_on_last_day] = ActiveModel::Type::Boolean.new.cast(raw[:salary_on_last_day]) if raw.key?(:salary_on_last_day)
    raw
  end

  def remember_me_param
    ActiveModel::Type::Boolean.new.cast(params[:remember_me])
  end
end
