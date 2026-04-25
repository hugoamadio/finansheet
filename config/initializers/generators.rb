# Torna UUID o tipo default do primary key gerado por `bin/rails g model`.
# Não afeta `t.references` — lá ainda precisa de `type: :uuid` explícito.
Rails.application.config.generators do |g|
  g.orm :active_record, primary_key_type: :uuid
end
