# Lê ?cycle=N. Ausente ou fora do intervalo navegável (do ciclo 1 até 6
# ciclos à frente do aberto), usa o ciclo aberto.
module CycleParam
  extend ActiveSupport::Concern

  MAX_AHEAD = 6

  private

  def cycle_number_param
    open_number = current_user.open_cycle.number
    number = Integer(params[:cycle].to_s, exception: false)
    number&.between?(1, open_number + MAX_AHEAD) ? number : open_number
  end
end
