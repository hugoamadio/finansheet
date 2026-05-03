class AllowNullPasswordDigest < ActiveRecord::Migration[8.1]
  # Users criados via OAuth (Google) não têm senha local, então
  # `password_digest` precisa aceitar NULL. A presença obrigatória pra
  # signup tradicional é garantida por validation no model
  # (validates :password, presence: true, on: :create, unless: provider).
  def change
    change_column_null :users, :password_digest, true
  end
end
