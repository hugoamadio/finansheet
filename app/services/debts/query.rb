module Debts
  # O que outras pessoas devem: parcelas de compras de terceiros que já
  # caíram (ciclo aberto ou anteriores) e ainda não foram devolvidas.
  # Agrupa pelo nome sem diferenciar maiúsculas e acentos ("Mãe" e "mae"
  # são a mesma pessoa); o nome mostrado é o primeiro usado.
  class Query
    Item = Data.define(:installment_id, :description, :number, :installments_count, :amount, :cycle_number)
    Debt = Data.define(:name, :total, :items)

    def self.key(name)
      I18n.transliterate(name.to_s).downcase.squish
    end

    def initialize(user:)
      @user = user
    end

    def call
      rows.group_by { |row| self.class.key(row.first) }.values.map do |group|
        items = group.map do |_name, id, description, number, count, amount, cycle_number|
          Item.new(installment_id: id, description:, number:, installments_count: count, amount:, cycle_number:)
        end
        Debt.new(name: group.first.first, total: items.sum(&:amount), items:)
      end.sort_by { |debt| self.class.key(debt.name) }
    end

    # Nomes já usados, para sugerir no formulário.
    def known_names
      @user.card_purchases.where.not(third_party_name: nil).order(:created_at).pluck(:third_party_name)
           .uniq { |name| self.class.key(name) }
           .sort_by { |name| self.class.key(name) }
    end

    private

    def rows
      Installment.joins(:card_purchase)
                 .where(card_purchases: { user_id: @user.id }, reimbursed_at: nil)
                 .where.not(card_purchases: { third_party_name: nil })
                 .where(installments: { cycle_number: ..@user.open_cycle.number })
                 .order("installments.cycle_number", "card_purchases.created_at")
                 .pluck("card_purchases.third_party_name", "installments.id", "card_purchases.description",
                        "installments.number", "card_purchases.installments_count", "installments.amount",
                        "installments.cycle_number")
    end
  end
end
