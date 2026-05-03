class OmniauthCallbacksController < ApplicationController
  # Callback do OAuth: o middleware OmniAuth deixa o hash autenticado em
  # request.env["omniauth.auth"]. Aqui materializamos o User (linka conta
  # existente por email ou cria nova) e devolvemos JWT pelo redirect.
  #
  # Frontend (auth_controller.js no /dashboard) captura ?token=… da URL,
  # salva em localStorage, e limpa a URL com history.replaceState.
  def callback
    user = User.from_omniauth(request.env["omniauth.auth"])
    return redirect_with_failure if user.nil?

    token = AuthToken.encode(user_id: user.id, remember_me: true)
    redirect_to "/dashboard?token=#{token}", allow_other_host: false
  rescue => e
    Rails.logger.error("[oauth] callback failed: #{e.class}: #{e.message}")
    redirect_with_failure
  end

  # GET /auth/failure?message=…&strategy=…
  # OmniAuth manda pra cá quando algo falha (invalid_credentials,
  # csrf_detected, invalid_client etc.). Levamos pro /login com um flag
  # pro frontend mostrar uma mensagem amigável.
  def failure
    redirect_with_failure
  end

  private

  def redirect_with_failure
    redirect_to "/login?oauth_error=1", allow_other_host: false
  end
end
