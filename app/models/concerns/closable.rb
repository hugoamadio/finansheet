module Closable
  extend ActiveSupport::Concern

  included do
    before_update  :prevent_change_when_closed
    before_destroy :prevent_destroy_when_closed
  end

  def closed?
    raise NotImplementedError, "#{self.class} must implement #closed?"
  end

  def was_closed?
    raise NotImplementedError, "#{self.class} must implement #was_closed?"
  end

  private

  def prevent_change_when_closed
    return unless was_closed?

    errors.add(:base, "registro fechado e imutável")
    throw :abort
  end

  def prevent_destroy_when_closed
    return unless closed?

    errors.add(:base, "registro fechado não pode ser removido")
    throw :abort
  end
end
