# Seed idempotente — rodar `bin/rails db:seed` quantas vezes quiser.

User.find_or_create_by!(email: "dev@finansheet.local") do |u|
  u.password = "password"
end

puts "Seeded user: dev@finansheet.local / password"
