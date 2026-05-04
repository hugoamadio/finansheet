class AddTourToUsers < ActiveRecord::Migration[8.1]
  # Estado do tour de onboarding (driver.js).
  # - tour_completed_at: gravado quando user clica "Concluir tour" no
  #   último passo.
  # - tour_skipped_at:   gravado quando user clica "Pular tour" no overlay.
  # Tour só roda quando AMBAS flags estão nulas + user está em /dashboard.
  #
  # Backfill marca todos users existentes como skipped — não queremos rodar
  # o tour em quem já tem o sistema configurado.
  def change
    add_column :users, :tour_completed_at, :datetime
    add_column :users, :tour_skipped_at,   :datetime

    reversible do |dir|
      dir.up do
        # Skip-by-default pra contas existentes na hora do deploy.
        User.update_all(tour_skipped_at: Time.current)
      end
    end
  end
end
