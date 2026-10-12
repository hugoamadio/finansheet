import { Controller } from "@hotwired/stimulus"

// Página "Ciclos" (GET /api/cycles):
// - Agora e próximos: ciclo aberto (ao vivo) + prévia dos 6 seguintes
// - Anteriores: retrato gravado em cada virada
// Clicar no ciclo abre a tela principal nele (/dashboard?cycle=N).
export default class extends Controller {
  static targets = ["upcoming", "closed"]

  async connect() {
    try {
      const resp = await this.authFetch("/api/cycles")
      if (!resp.ok) throw new Error(`GET /api/cycles falhou: ${resp.status}`)
      const data = await resp.json()
      this.renderUpcoming(data.open, data.upcoming ?? [])
      this.renderClosed(data.closed ?? [])
    } catch (err) {
      console.error("[cycles-page] load failed", err)
      this.upcomingTarget.innerHTML = `<tbody><tr><td class="cycles-table__empty">Erro ao carregar os ciclos.</td></tr></tbody>`
    }
  }

  renderUpcoming(open, rows) {
    const openRow = tableRow(`Aberto · desde ${formatShortDate(open.started_at)}`, open.number, {
      income: open.expected_income, own: open.own_cards, third: open.third_party,
      fixed: open.fixed_expenses, balance: open.balance,
    })
    const next = rows.map((row) => {
      const ahead = row.number - open.number
      return tableRow(ahead === 1 ? "Próximo" : `Daqui a ${ahead}`, row.number, {
        income: row.expected_income, own: row.own_cards, third: row.third_party,
        fixed: row.fixed_expenses, balance: row.balance,
      })
    })
    this.upcomingTarget.innerHTML = tableHead("Ciclo", "A receber") + `<tbody>${[openRow, ...next].join("")}</tbody>`
  }

  renderClosed(rows) {
    if (rows.length === 0) {
      this.closedTarget.innerHTML = `<tbody><tr><td class="cycles-table__empty">Nenhum ciclo fechado ainda.</td></tr></tbody>`
      return
    }
    const body = rows.map((row) => tableRow(
      `${formatShortDate(row.started_at)} → ${formatShortDate(row.closed_at)}`, row.number,
      { income: row.income, own: row.own_cards, third: row.third_party, fixed: row.fixed_expenses, balance: row.balance },
    ))
    this.closedTarget.innerHTML = tableHead("Período", "Renda") + `<tbody>${body.join("")}</tbody>`
  }

  authFetch(url, options = {}) {
    const token = localStorage.getItem("auth_token")
    const headers = {
      "Accept": "application/json",
      ...(options.headers ?? {}),
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    }
    return fetch(url, { ...options, headers })
  }
}

function tableHead(first, incomeLabel) {
  return `<thead><tr>
    <th>${first}</th><th>${incomeLabel}</th><th>Seus cartões</th>
    <th>De outras pessoas</th><th>Contas fixas</th><th>Sobra</th>
  </tr></thead>`
}

function tableRow(label, number, { income, own, third, fixed, balance }) {
  return `<tr>
    <td><a href="/dashboard?cycle=${number}">${label}</a></td>
    <td>${formatBRL(income)}</td>
    <td>${formatBRL(own)}</td>
    <td>${formatBRL(third)}</td>
    <td>${formatBRL(fixed)}</td>
    <td class="${Number(balance) < 0 ? "is-negative" : ""}">${formatBRL(balance)}</td>
  </tr>`
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

// "12/out"
function formatShortDate(iso) {
  if (!iso) return "—"
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, "0")}/${MONTHS[d.getMonth()]}`
}

function formatBRL(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return "R$ 0,00"
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}
