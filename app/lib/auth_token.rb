class AuthToken
  ALGORITHM = "HS256".freeze
  DEFAULT_EXPIRATION = 24.hours
  REMEMBER_EXPIRATION = 30.days

  class << self
    def encode(user_id:, remember_me: false)
      payload = {
        user_id: user_id,
        exp: expiration_for(remember_me).to_i
      }
      JWT.encode(payload, secret, ALGORITHM)
    end

    def decode(token)
      payload, = JWT.decode(token, secret, true, algorithm: ALGORITHM)
      payload.symbolize_keys
    rescue JWT::DecodeError, JWT::ExpiredSignature
      nil
    end

    private

    def expiration_for(remember_me)
      (remember_me ? REMEMBER_EXPIRATION : DEFAULT_EXPIRATION).from_now
    end

    def secret
      Rails.application.secret_key_base
    end
  end
end
