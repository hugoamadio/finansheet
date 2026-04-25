import { Controller } from "@hotwired/stimulus"

// Página inicial: grid de cartões + CRUD via modal.
// Padrão do projeto: lista vem de fetch após render.
//
// Loading em duas etapas:
//   1) GET /api/cards            — metadata (id/name/banco/days) + flags do mês
//   2) GET /api/cards/:id/installments?month=...  — por cartão, popula items+totais
//
// Estado do mês visualizado fica na URL (?month=YYYY-MM) pra sobreviver F5.
export default class extends Controller {
  static targets = [
    "grid", "loading", "cardTemplate",
    "formModal", "formTitle", "form", "formId", "formSubmit",
    "fieldName", "fieldBank", "fieldMode", "fieldPayDay", "fieldBestDay",
    "purchaseModal", "purchaseForm", "purchaseSubmit", "purchaseCardId",
    "purchaseCardHeader", "purchaseCardName", "purchaseCardBank", "purchaseCardMeta",
    "purchaseFieldDescription", "purchaseFieldTotal", "purchaseFieldInstallments",
    "purchaseFieldDate", "purchasePreview",
    "monthLabel", "prevButton", "closedTag", "closeCycleButton",
    "closeCycleModal", "closeCycleMonth", "closeCycleSummary", "closeCycleConfirm",
    "notice", "noticeText", "noticeAction",
  ]

  connect() {
    this.cards = []
    this.installmentsByCard = {}
    this.currentMonth = readMonthFromURL() ?? firstDayOfCurrentMonth()
    this.monthClosedAt = null
    this.hasEarlierData = false
    this.loadCards()
  }

  // ---- API: cards (metadata + globals do mês) ----

  async loadCards({ withFade = false } = {}) {
    if (withFade) this.gridTarget.classList.add("cards-grid--fading")
    else this.showLoading()

    try {
      const monthParam = formatYMD(this.currentMonth)
      const resp = await this.authFetch(`/api/cards?month=${monthParam}`)
      if (!resp.ok) throw new Error(`GET /api/cards falhou: ${resp.status}`)
      const data = await resp.json()
      this.cards = data.cards ?? []
      this.hasEarlierData = !!data.has_earlier_data
      this.monthClosedAt  = data.month_closed_at
      this.installmentsByCard = {}
      this.render()
      this.renderMonthNav()
      // dispara fetch das installments de cada cartão (em paralelo, sem esperar)
      this.cards.forEach((c) => this.loadInstallments(c.id))
    } catch (err) {
      console.error("[cards] load failed", err)
      this.gridTarget.innerHTML = `<div class="cards-grid__empty">Erro carregando cartões.</div>`
    } finally {
      this.gridTarget.classList.remove("cards-grid--fading")
    }
  }

  // ---- API: installments por cartão (endpoint dedicado) ----

  async loadInstallments(cardId) {
    const cardEl = this.findCardEl(cardId)
    if (!cardEl) return

    cardEl.classList.add("card-item--loading-items")

    try {
      const monthParam = formatYMD(this.currentMonth)
      const resp = await this.authFetch(`/api/cards/${cardId}/installments?month=${monthParam}`)
      if (!resp.ok) throw new Error(`GET installments falhou: ${resp.status}`)
      const data = await resp.json()
      this.installmentsByCard[cardId] = data
      this.applyInstallments(cardEl, data)
    } catch (err) {
      console.error(`[cards] installments load failed for ${cardId}`, err)
      const itemsEl = cardEl.querySelector("[data-items]")
      itemsEl.innerHTML = `<li style="opacity:0.7;font-style:italic;">Erro carregando lançamentos</li>`
    } finally {
      cardEl.classList.remove("card-item--loading-items")
    }
  }

  applyInstallments(cardEl, data) {
    const itemsEl = cardEl.querySelector("[data-items]")
    itemsEl.innerHTML = ""

    for (const inst of data.month_installments ?? []) {
      const fraction = inst.installments_count === 1
        ? "x1"
        : `${inst.number}/${inst.installments_count}`

      const li = document.createElement("li")
      li.innerHTML = `
        <span class="card-item__item-label">
          ${escapeHtml(inst.description)}
          <span class="card-item__item-installment">${fraction}</span>
        </span>
        <span class="card-item__item-amount">${formatBRL(inst.amount)}</span>
      `
      itemsEl.appendChild(li)
    }

    const moreEl = cardEl.querySelector("[data-more]")
    if (data.month_installments_overflow) {
      moreEl.textContent = `+${data.month_installments_overflow} parcela(s)`
      moreEl.hidden = false
    } else {
      moreEl.hidden = true
    }

    cardEl.querySelector("[data-month-total]").textContent = formatBRL(data.month_total ?? 0)
    cardEl.querySelector("[data-total-open]").textContent  = formatBRL(data.total_open  ?? 0)
  }

  // ---- Navegação de mês (URL state) ----

  prevMonth() {
    if (!this.canGoBack()) return
    this.currentMonth = addMonths(this.currentMonth, -1)
    writeMonthToURL(this.currentMonth)
    this.loadCards({ withFade: true })
  }

  // Pode voltar enquanto: estiver à frente do mês corrente do calendário,
  // OU houver dados em meses anteriores ao visualizado.
  canGoBack() {
    return this.currentMonth > firstDayOfCurrentMonth() || this.hasEarlierData
  }

  nextMonth() {
    this.currentMonth = addMonths(this.currentMonth, 1)
    writeMonthToURL(this.currentMonth)
    this.loadCards({ withFade: true })
  }

  renderMonthNav() {
    this.monthLabelTarget.textContent = formatMonthLabel(this.currentMonth)
    this.prevButtonTarget.disabled = !this.canGoBack()

    const closed = !!this.monthClosedAt
    this.closedTagTarget.hidden = !closed
    this.closeCycleButtonTarget.disabled = closed
    this.closeCycleButtonTarget.textContent = closed ? "Mês fechado" : "Virar Mês"
  }

  // ---- Modal "Virar Mês" ----

  openCloseCycle() {
    if (this.monthClosedAt) return

    this.closeCycleMonthTarget.textContent = formatMonthLabel(this.currentMonth)

    const lines = this.cards
      .map((c) => ({ name: c.name, total: Number(this.installmentsByCard[c.id]?.month_total ?? 0) }))
      .filter((row) => row.total > 0)
      .map((row) => `<div style="display:flex;justify-content:space-between"><span>${escapeHtml(row.name || "—")}</span><strong>${formatBRL(row.total)}</strong></div>`)

    const grandTotal = this.cards.reduce(
      (sum, c) => sum + Number(this.installmentsByCard[c.id]?.month_total ?? 0), 0
    )
    const summary = lines.length === 0
      ? `<div style="opacity:0.7">Nenhum lançamento de cartão nesse mês.</div>`
      : lines.join("") + `<hr style="margin:0.5rem 0;border:none;border-top:1px solid #cbd5e1"><div style="display:flex;justify-content:space-between"><span>Total</span><strong>${formatBRL(grandTotal)}</strong></div>`

    this.closeCycleSummaryTarget.innerHTML = summary
    this.closeCycleModalTarget.showModal()
  }

  closeCloseCycleModal() {
    this.closeCycleModalTarget.close()
  }

  async confirmCloseCycle() {
    this.closeCycleConfirmTarget.disabled = true
    this.closeCycleConfirmTarget.innerHTML = `<span class="spinner"></span> Fechando…`

    try {
      const resp = await this.authFetch(`/api/cycles/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: formatYMD(this.currentMonth) }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        alert((data.errors || ["Erro ao fechar o mês"]).join(", "))
        return
      }
      this.closeCloseCycleModal()
      await this.loadCards({ withFade: true })
    } catch (err) {
      console.error("[cards] close cycle failed", err)
      alert("Erro ao fechar o mês.")
    } finally {
      this.closeCycleConfirmTarget.disabled = false
      this.closeCycleConfirmTarget.textContent = "Confirmar"
    }
  }

  // ---- CRUD do cartão (modal create/edit) ----

  async submitForm(event) {
    event.preventDefault()
    const id = this.formIdTarget.value
    const payload = {
      name:     this.fieldNameTarget.value.trim(),
      bank:     this.fieldBankTarget.value.trim(),
      mode:     this.fieldModeTarget.value,
      pay_day:  this.parseDay(this.fieldPayDayTarget.value),
      best_day: this.parseDay(this.fieldBestDayTarget.value),
    }

    this.setSubmitting(true)
    try {
      const url = id ? `/api/cards/${id}` : `/api/cards`
      const method = id ? "PATCH" : "POST"
      const resp = await this.authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card: payload }),
      })

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        const errs = (data.errors || ["Erro ao salvar"]).join(", ")
        alert(errs)
        return
      }

      this.closeForm()
      await this.loadCards()
    } catch (err) {
      console.error("[cards] submit failed", err)
      alert("Erro ao salvar o cartão.")
    } finally {
      this.setSubmitting(false)
    }
  }

  async remove(event) {
    const cardEl = event.currentTarget.closest(".card-item")
    const id = cardEl.dataset.cardId
    const card = this.cards.find((c) => c.id === id)
    if (!card) return
    if (!confirm(`Remover o cartão "${card.name}"?`)) return

    try {
      const resp = await this.authFetch(`/api/cards/${id}`, { method: "DELETE" })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        alert((data.errors || ["Erro ao remover"]).join(", "))
        return
      }
      await this.loadCards()
    } catch (err) {
      console.error("[cards] delete failed", err)
      alert("Erro ao remover o cartão.")
    }
  }

  openCreate() {
    this.resetForm()
    this.formTitleTarget.textContent = "Novo cartão"
    this.formModalTarget.showModal()
    this.fieldNameTarget.focus()
  }

  openEdit(event) {
    const id = event.currentTarget.closest(".card-item").dataset.cardId
    const card = this.cards.find((c) => c.id === id)
    if (!card) return

    this.formIdTarget.value         = card.id
    this.fieldNameTarget.value      = card.name ?? ""
    this.fieldBankTarget.value      = card.bank ?? ""
    this.fieldModeTarget.value      = card.mode ?? "credit"
    this.fieldPayDayTarget.value    = card.pay_day ?? ""
    this.fieldBestDayTarget.value   = card.best_day ?? ""

    this.formTitleTarget.textContent = "Editar cartão"
    this.formModalTarget.showModal()
    this.fieldNameTarget.focus()
  }

  closeForm() {
    this.formModalTarget.close()
  }

  // ---- Modal: lançar compra ----

  openPurchase(event) {
    const id = event.currentTarget.closest(".card-item").dataset.cardId
    const card = this.cards.find((c) => c.id === id)
    if (!card) return

    if (!card.best_day) {
      alert("Esse cartão precisa de um dia de fechamento (best_day) antes de receber compras. Edite o cartão primeiro.")
      return
    }

    this.purchaseFormTarget.reset()
    this.purchaseCardIdTarget.value = card.id
    this.purchaseCardNameTarget.textContent = card.name || "—"
    this.purchaseCardBankTarget.textContent = card.bank || ""
    this.purchaseCardMetaTarget.textContent = `Fecha dia ${card.best_day} · vence dia ${card.pay_day ?? "—"}`

    this.purchaseCardHeaderTarget.classList.remove("modal-purchase__card--credit", "modal-purchase__card--debit")
    this.purchaseCardHeaderTarget.classList.add(card.mode === "debit" ? "modal-purchase__card--debit" : "modal-purchase__card--credit")

    const today = new Date()
    this.purchaseFieldDateTarget.value = today.toISOString().slice(0, 10)
    this.purchaseFieldInstallmentsTarget.value = "1"

    this.updatePurchasePreview()
    this.purchaseModalTarget.showModal()
    this.purchaseFieldDescriptionTarget.focus()
  }

  closePurchase() {
    this.purchaseModalTarget.close()
  }

  updatePurchasePreview() {
    const total = parseFloat(this.purchaseFieldTotalTarget.value)
    const count = parseInt(this.purchaseFieldInstallmentsTarget.value, 10)
    const dateStr = this.purchaseFieldDateTarget.value
    const cardId = this.purchaseCardIdTarget.value
    const card = this.cards.find((c) => c.id === cardId)

    if (!total || !count || count < 1 || !dateStr || !card?.best_day) {
      this.purchasePreviewTarget.hidden = true
      return
    }

    const baseAmount = Math.floor((total / count) * 100) / 100
    const lastAmount = Math.round((total - baseAmount * (count - 1)) * 100) / 100

    // compra <= best_day → fatura corrente (mesmo mês);
    // compra >  best_day → próxima fatura (mês seguinte).
    const purchaseDate = new Date(dateStr + "T00:00:00")
    const day = purchaseDate.getDate()
    const offsetMonths = day <= card.best_day ? 0 : 1
    const firstDue = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth() + offsetMonths, 1)

    const fmtMonth = (d) => d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
    const fmtMoney = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

    const lastDue = new Date(firstDue.getFullYear(), firstDue.getMonth() + count - 1, 1)
    const splitTxt = baseAmount === lastAmount
      ? `${count}× ${fmtMoney(baseAmount)}`
      : `${count - 1}× ${fmtMoney(baseAmount)} + 1× ${fmtMoney(lastAmount)}`

    this.purchasePreviewTarget.innerHTML = `<strong>${splitTxt}</strong> — primeira em ${fmtMonth(firstDue)}, última em ${fmtMonth(lastDue)}`
    this.purchasePreviewTarget.hidden = false
  }

  async submitPurchase(event) {
    event.preventDefault()

    const cardId = this.purchaseCardIdTarget.value
    const payload = {
      description: this.purchaseFieldDescriptionTarget.value.trim(),
      total_amount: parseFloat(this.purchaseFieldTotalTarget.value),
      installments_count: parseInt(this.purchaseFieldInstallmentsTarget.value, 10),
      purchased_on: this.purchaseFieldDateTarget.value,
    }

    this.setPurchaseSubmitting(true)
    try {
      const resp = await this.authFetch(`/api/cards/${cardId}/purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchase: payload }),
      })

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        alert((data.errors || ["Erro ao lançar compra"]).join(", "))
        return
      }

      this.closePurchase()

      // Refresca SÓ o card afetado, sem mexer no mês visualizado
      // (preserva o contexto dos outros cards). Se a 1ª parcela caiu em outro
      // mês, mostra notice com atalho pra navegar até lá.
      const data = await resp.json().catch(() => ({}))
      const firstDue = data.purchase?.installments?.[0]?.due_month
      const targetMonth = firstDue ? parseYMD(firstDue) : null

      await this.loadInstallments(cardId)

      if (targetMonth && !sameMonth(targetMonth, this.currentMonth)) {
        this.showNotice({
          text: `Lançamento criado · primeira parcela em ${formatMonthLabel(targetMonth)}.`,
          action: { label: `Ver ${formatMonthLabel(targetMonth)}`, month: targetMonth },
        })
      } else {
        this.showNotice({ text: `Lançamento criado.`, autoHideMs: 3500 })
      }
    } catch (err) {
      console.error("[cards] purchase failed", err)
      alert("Erro ao lançar a compra.")
    } finally {
      this.setPurchaseSubmitting(false)
    }
  }

  setPurchaseSubmitting(flag) {
    this.purchaseSubmitTarget.disabled = flag
    this.purchaseSubmitTarget.innerHTML = flag
      ? `<span class="spinner"></span> Lançando…`
      : `Lançar`
  }

  // ---- Notice (toast inline) ----

  showNotice({ text, action = null, autoHideMs = null }) {
    if (this.noticeHideTimer) clearTimeout(this.noticeHideTimer)

    this.noticeTextTarget.textContent = text
    if (action) {
      this.noticeActionTarget.textContent = action.label
      this.noticeActionTarget.dataset.targetMonth = formatYMD(action.month)
      this.noticeActionTarget.hidden = false
    } else {
      this.noticeActionTarget.hidden = true
      delete this.noticeActionTarget.dataset.targetMonth
    }
    this.noticeTarget.hidden = false

    if (autoHideMs) {
      this.noticeHideTimer = setTimeout(() => this.dismissNotice(), autoHideMs)
    }
  }

  dismissNotice() {
    if (this.noticeHideTimer) clearTimeout(this.noticeHideTimer)
    this.noticeTarget.hidden = true
  }

  followNotice() {
    const ymd = this.noticeActionTarget.dataset.targetMonth
    if (!ymd) return
    this.currentMonth = parseYMD(ymd)
    writeMonthToURL(this.currentMonth)
    this.dismissNotice()
    this.loadCards({ withFade: true })
  }

  // ---- Render ----

  render() {
    this.gridTarget.innerHTML = ""

    if (this.cards.length === 0) {
      const placeholder = document.createElement("button")
      placeholder.type = "button"
      placeholder.className = "card-item card-item--add"
      placeholder.innerHTML = `<span class="card-item--add__icon">+</span><span class="card-item--add__label">Cadastre seu primeiro cartão</span>`
      placeholder.addEventListener("click", () => this.openCreate())
      this.gridTarget.appendChild(placeholder)
      return
    }

    for (const card of this.cards) {
      this.gridTarget.appendChild(this.buildCardEl(card))
    }
  }

  buildCardEl(card) {
    const node = this.cardTemplateTarget.content.firstElementChild.cloneNode(true)
    node.dataset.cardId = card.id
    node.classList.add(card.mode === "debit" ? "card-item--debit" : "card-item--credit")

    node.querySelector("[data-name]").textContent = card.name || "—"
    node.querySelector("[data-bank]").textContent = card.bank || ""
    node.querySelector("[data-mode]").textContent = card.mode === "debit" ? "Débito" : "Crédito"
    node.querySelector("[data-pay-day]").textContent  = card.pay_day  ?? "—"
    node.querySelector("[data-best-day]").textContent = card.best_day ?? "—"

    // Items + totais ficam vazios — populados em loadInstallments(cardId)
    node.querySelector("[data-items]").innerHTML = `<li style="opacity:0.5;font-style:italic;">Carregando…</li>`
    node.querySelector("[data-month-total]").textContent = "—"
    node.querySelector("[data-total-open]").textContent  = "—"

    return node
  }

  showLoading() {
    this.gridTarget.innerHTML = `<div class="cards-grid__loading"><span class="spinner"></span> Carregando cartões…</div>`
  }

  findCardEl(cardId) {
    return this.gridTarget.querySelector(`.card-item[data-card-id="${cardId}"]`)
  }

  // ---- Helpers ----

  resetForm() {
    this.formTarget.reset()
    this.formIdTarget.value = ""
    this.fieldModeTarget.value = "credit"
  }

  parseDay(value) {
    const n = parseInt(value, 10)
    return Number.isFinite(n) && n >= 1 && n <= 31 ? n : null
  }

  setSubmitting(flag) {
    this.formSubmitTarget.disabled = flag
    this.formSubmitTarget.innerHTML = flag
      ? `<span class="spinner"></span> Salvando…`
      : `Salvar`
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

function formatBRL(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return "R$ 0,00"
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function firstDayOfCurrentMonth() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function addMonths(date, n) {
  return new Date(date.getFullYear(), date.getMonth() + n, 1)
}

function formatYMD(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function formatMonthLabel(date) {
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
}

function parseYMD(str) {
  const [y, m] = String(str).split("-").map((v) => parseInt(v, 10))
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null
  return new Date(y, m - 1, 1)
}

function sameMonth(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

function readMonthFromURL() {
  const value = new URLSearchParams(window.location.search).get("month")
  if (!value) return null
  // aceita "YYYY-MM" ou "YYYY-MM-DD"
  const [y, m] = value.split("-").map((v) => parseInt(v, 10))
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null
  return new Date(y, m - 1, 1)
}

function writeMonthToURL(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const url = new URL(window.location.href)
  url.searchParams.set("month", `${y}-${m}`)
  window.history.replaceState({}, "", url)
}
