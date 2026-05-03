class AddOauthToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :provider, :string
    add_column :users, :uid,      :string

    # Index parcial: só registros com provider preenchido entram na regra de
    # unicidade. Users sem OAuth (só email/senha) não disputam unicidade
    # entre si nesse índice.
    add_index :users, [:provider, :uid],
              unique: true,
              where:  "provider IS NOT NULL",
              name:   "idx_users_provider_uid"
  end
end
