import { Controller } from "@hotwired/stimulus"

// Página inicial: grid de cartões do ciclo visualizado + CRUD via modal.
// Padrão do projeto: lista vem de fetch após render.
//
// Loading em duas etapas:
//   1) GET /api/cards?cycle=N                  — cabeçalho do ciclo + cartões
//   2) GET /api/cards/:id/installments?cycle=N — por cartão, itens + totais
//
// O ciclo visualizado fica na URL (?cycle=N) pra sobreviver F5. Sem o
// parâmetro, o backend devolve o ciclo aberto e a gente adota.
const ITEMS_PREVIEW = 10

export default class extends Controller {
  static targets = [
    "grid", "loading", "cardTemplate",
    "formModal", "formTitle", "form", "formId", "formSubmit",
    "fieldName", "fieldBank", "fieldMode", "fieldPayDay", "fieldBestDay", "fieldColor",
    "purchaseModal", "purchaseForm", "purchaseSubmit", "purchaseCardId",
    "purchaseCardHeader", "purchaseCardName", "purchaseCardBank", "purchaseCardMeta",
    "purchaseFieldDescription", "purchaseFieldTotal", "purchaseFieldInstallments",
    "purchaseFieldHasPaid", "purchaseFieldPaidWrapper", "purchaseFieldPaidCount",
    "purchaseFieldDate", "purchaseFieldThirdParty", "thirdPartyNames",
    "purchaseFieldRefund", "purchaseFieldInstallmentsWrapper", "purchaseFieldHasPaidWrapper", "purchaseFieldThirdPartyWrapper",
    "purchasePreview",
    "cycleLabel", "prevButton", "nextButton", "statusTag", "turnButton", "turnLabel",
    "notice", "noticeText",
  ]

  connect() {
    this.cards = []
    this.installmentsByCard = {}
    this.expanded = new Set()
    this.cycleNumber = readCycleFromURL()
    this.cycle = null

    // Os modais de editar/remover compra, o menu da compra e o de income
    // moram em controllers próprios. Aqui só ouvimos o que eles avisam.
    this.onPurchaseChanged = (event) => {
      const cardId = event.detail?.cardId
      if (cardId) this.loadInstallments(cardId)
    }
    this.onIncomeChanged = (event) => {
      if (!this.isOpen) return
      this.cycle.expected_income = Number(event.detail?.amount ?? 0)
      this.emitSummaryUpdate()
    }
    window.addEventListener("purchase:changed", this.onPurchaseChanged)
    window.addEventListener("income:changed",   this.onIncomeChanged)

    this.loadCards()
  }

  disconnect() {
    window.removeEventListener("purchase:changed", this.onPurchaseChanged)
    window.removeEventListener("income:changed",   this.onIncomeChanged)
  }

  get isOpen() {
    return this.cycle?.status === "open"
  }

  // ---- API: cartões + cabeçalho do ciclo ----

  async loadCards({ withFade = false } = {}) {
    if (withFade) this.gridTarget.classList.add("cards-grid--fading")
    else this.showLoading()

    try {
      const url = this.cycleNumber ? `/api/cards?cycle=${this.cycleNumber}` : `/api/cards`
      const resp = await this.authFetch(url)
      if (!resp.ok) throw new Error(`GET /api/cards falhou: ${resp.status}`)
      const data = await resp.json()
      // O backend corrige número ausente/fora do intervalo; adotamos o dele.
      this.cycle = data.cycle
      this.cycleNumber = data.cycle.number
      writeCycleToURL(this.cycleNumber)
      this.cards = data.cards ?? []
      this.installmentsByCard = {}
      this.expanded.clear()
      this.render()
      this.renderCycleNav()
      this.emitSummaryUpdate()
      this.cards.forEach((c) => this.loadInstallments(c.id))
    } catch (err) {
      console.error("[cards] load failed", err)
      this.gridTarget.innerHTML = `<div class="cards-grid__empty">Erro carregando cartões.</div>`
    } finally {
      this.gridTarget.classList.remove("cards-grid--fading")
    }
  }

  // ---- API: parcelas por cartão ----

  async loadInstallments(cardId) {
    const cardEl = this.findCardEl(cardId)
    if (!cardEl) return

    cardEl.classList.add("card-item--loading-items")
    try {
      const resp = await this.authFetch(`/api/cards/${cardId}/installments?cycle=${this.cycleNumber}`)
      if (!resp.ok) throw new Error(`GET installments falhou: ${resp.status}`)
      const data = await resp.json()
      this.installmentsByCard[cardId] = data
      this.applyInstallments(cardEl, data)
    } catch (err) {
      console.error(`[cards] installments load failed for ${cardId}`, err)
      cardEl.querySelector("[data-items]").innerHTML = `<li style="opacity:0.7;font-style:italic;">Erro carregando lançamentos</li>`
    } finally {
      cardEl.classList.remove("card-item--loading-items")
    }
  }

  applyInstallments(cardEl, data) {
    const cardId  = cardEl.dataset.cardId
    const all     = data.installments ?? []
    const showAll = this.expanded.has(cardId)
    const visible = showAll ? all : all.slice(0, ITEMS_PREVIEW)

    const itemsEl = cardEl.querySelector("[data-items]")
    itemsEl.innerHTML = ""
    for (const inst of visible) itemsEl.appendChild(this.buildItemRow(inst, cardId))

    const moreEl = cardEl.querySelector("[data-more]")
    if (all.length > ITEMS_PREVIEW) {
      moreEl.textContent = showAll ? "Ver menos" : `Ver todas (+${all.length - ITEMS_PREVIEW})`
      moreEl.hidden = false
    } else {
      moreEl.hidden = true
    }

    cardEl.querySelector("[data-cycle-total]").textContent  = formatBRL(data.cycle_total ?? 0)
    cardEl.querySelector("[data-future-total]").textContent = formatBRL(data.future_total ?? 0)

    // A sobra depende do total de cada cartão; reemite a cada chegada.
    this.emitSummaryUpdate()
  }

  toggleMore(event) {
    const cardEl = event.currentTarget.closest(".card-item")
    const id = cardEl.dataset.cardId
    if (this.expanded.has(id)) this.expanded.delete(id)
    else this.expanded.add(id)

    const data = this.installmentsByCard[id]
    if (data) this.applyInstallments(cardEl, data)
  }

  buildItemRow(inst, cardId) {
    const li = document.createElement("li")
    if (inst.third_party_name) li.classList.add("card-item__items-row--third-party")

    const fraction = inst.installments_count === 1 ? "x1" : `${inst.number}/${inst.installments_count}`
    const tags = []
    if (inst.third_party_name) tags.push(`<span class="item-tag item-tag--person">${escapeHtml(inst.third_party_name)}</span>`)
    if (inst.prepaid)          tags.push(`<span class="item-tag">quitada</span>`)
    if (inst.cancelled)        tags.push(`<span class="item-tag">cancelada</span>`)
    if (inst.refund)           tags.push(`<span class="item-tag">estorno</span>`)

    const label = document.createElement("span")
    label.className = "card-item__item-label"
    label.innerHTML = `${escapeHtml(inst.description)}<span class="card-item__item-installment">${fraction}</span>${tags.join("")}`
    li.appendChild(label)

    const amount = document.createElement("span")
    amount.className = "card-item__item-amount"
    amount.textContent = formatBRL(inst.amount)
    li.appendChild(amount)

    // Um botão "⋯" por compra; quem monta o menu é o purchase_menu_controller.
    const menuBtn = document.createElement("button")
    menuBtn.type = "button"
    menuBtn.className = "card-item__item-action"
    menuBtn.title = "Ações da compra"
    menuBtn.setAttribute("aria-label", "Ações da compra")
    menuBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${DOTS_PATH}</svg>`
    menuBtn.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("purchase:menu-request", {
        detail: { cardId, cycleStatus: this.cycle?.status, inst, anchor: menuBtn },
      }))
    })

    const actions = document.createElement("span")
    actions.className = "card-item__item-actions"
    actions.appendChild(menuBtn)
    li.appendChild(actions)

    return li
  }

  // ---- Navegação entre ciclos (URL state) ----

  prevCycle() {
    if (!this.canGoBack()) return
    this.cycleNumber -= 1
    this.loadCards({ withFade: true })
  }

  nextCycle() {
    if (!this.canGoForward()) return
    this.cycleNumber += 1
    this.loadCards({ withFade: true })
  }

  canGoBack() {
    return !!this.cycle && this.cycle.number > (this.cycle.first_number ?? this.cycle.number)
  }

  canGoForward() {
    return !!this.cycle && this.cycle.number < this.cycle.max_number
  }

  renderCycleNav() {
    this.cycleLabelTarget.textContent = cycleTitle(this.cycle)
    this.prevButtonTarget.disabled = !this.canGoBack()
    this.nextButtonTarget.disabled = !this.canGoForward()

    const tag = { closed: "Fechado", upcoming: "Prévia" }[this.cycle.status]
    this.statusTagTarget.textContent = tag ?? ""
    this.statusTagTarget.hidden = !tag

    this.turnLabelTarget.textContent = this.isOpen ? "Virar ciclo" : "Voltar ao ciclo aberto"
  }

  // No ciclo aberto, vai para a tela de virada; nos outros, volta ao aberto.
  turnOrBack() {
    if (this.isOpen) {
      window.location.href = "/dashboard/virada"
      return
    }
    this.cycleNumber = this.cycle.open_number
    this.loadCards({ withFade: true })
  }

  // ---- Conferido ✓ ----

  async toggleCheck(event) {
    const btn = event.currentTarget
    const cardEl = btn.closest(".card-item")
    const card = this.cards.find((c) => c.id === cardEl.dataset.cardId)
    if (!card || !this.isOpen || btn.disabled) return

    btn.disabled = true
    try {
      const resp = await this.authFetch(`/api/cycles/current/cards/${card.id}/check`, {
        method: card.checked ? "DELETE" : "PUT",
      })
      if (!resp.ok) throw new Error(`check falhou: ${resp.status}`)
      card.checked = !card.checked
    } catch (err) {
      console.error("[cards] check failed", err)
      alert("Erro ao marcar o cartão.")
    } finally {
      this.applyCheck(cardEl, card)
    }
  }

  applyCheck(cardEl, card) {
    const btn = cardEl.querySelector("[data-check]")
    btn.hidden = !this.isOpen && !card.checked
    btn.disabled = !this.isOpen
    btn.classList.toggle("card-item__check--on", !!card.checked)
    btn.textContent = card.checked ? "Conferido ✓" : "Marcar conferido"
  }

  // ---- Resumo do ciclo (sidebar) ----

  // Emite "cycle:summary-update" pro cycle_summary_controller (sidebar) e
  // pro fixed_expenses_summary_controller. "Seus cartões" usa só as compras
  // do usuário; as de outras pessoas vão numa linha informativa.
  emitSummaryUpdate() {
    if (!this.cycle) return

    const cardLines = this.cards
      .map((c) => ({ name: c.name, total: Number(this.installmentsByCard[c.id]?.cycle_total_own ?? 0) }))
      .filter((l) => l.total > 0)

    const thirdPartyTotal = this.cards.reduce((sum, c) => {
      const data = this.installmentsByCard[c.id]
      return sum + Number(data?.cycle_total ?? 0) - Number(data?.cycle_total_own ?? 0)
    }, 0)

    window.dispatchEvent(new CustomEvent("cycle:summary-update", {
      detail: {
        cycleNumber:    this.cycle.number,
        status:         this.cycle.status,
        label:          cycleTitle(this.cycle),
        expectedIncome: this.cycle.expected_income,
        cardLines,
        thirdPartyTotal,
      },
    }))
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
      color:    this.fieldColorTarget.value,
    }

    this.setSubmitting(true)
    try {
      const url = id ? `/api/cards/${id}` : `/api/cards`
      const resp = await this.authFetch(url, {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card: payload }),
      })

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        alert((data.errors || ["Erro ao salvar"]).join(", "))
        return
      }

      this.closeForm()
      await this.loadCards()
      // Sinaliza criação (não edição) — o tour de onboarding avança.
      if (!id) window.dispatchEvent(new CustomEvent("card:created"))
    } catch (err) {
      console.error("[cards] submit failed", err)
      alert("Erro ao salvar o cartão.")
    } finally {
      this.setSubmitting(false)
    }
  }

  async remove(event) {
    const cardEl = event.currentTarget.closest(".card-item")
    const card = this.cards.find((c) => c.id === cardEl.dataset.cardId)
    if (!card) return
    if (!confirm(`Remover o cartão "${card.name}"?`)) return

    try {
      const resp = await this.authFetch(`/api/cards/${card.id}`, { method: "DELETE" })
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
    const card = this.cards.find((c) => c.id === event.currentTarget.closest(".card-item").dataset.cardId)
    if (!card) return

    this.formIdTarget.value       = card.id
    this.fieldNameTarget.value    = card.name ?? ""
    this.fieldBankTarget.value    = card.bank ?? ""
    this.fieldModeTarget.value    = card.mode ?? "credit"
    this.fieldPayDayTarget.value  = card.pay_day ?? ""
    this.fieldBestDayTarget.value = card.best_day ?? ""
    this.fieldColorTarget.value   = card.color ?? "#1d4ed8"

    this.formTitleTarget.textContent = "Editar cartão"
    this.formModalTarget.showModal()
    this.fieldNameTarget.focus()
  }

  closeForm() {
    this.formModalTarget.close()
  }

  // ---- Modal: lançar compra ----

  openPurchase(event) {
    if (!this.isOpen) return
    const card = this.cards.find((c) => c.id === event.currentTarget.closest(".card-item").dataset.cardId)
    if (!card) return

    this.purchaseFormTarget.reset()
    this.purchaseCardIdTarget.value = card.id
    this.purchaseCardNameTarget.textContent = card.name || "—"
    this.purchaseCardBankTarget.textContent = card.bank || ""
    this.purchaseCardMetaTarget.textContent = cardMeta(card)

    this.purchaseCardHeaderTarget.classList.remove("modal-purchase__card--credit", "modal-purchase__card--debit")
    this.purchaseCardHeaderTarget.classList.add(card.mode === "debit" ? "modal-purchase__card--debit" : "modal-purchase__card--credit")
    this.purchaseCardHeaderTarget.style.background = card.color || ""

    this.purchaseFieldDateTarget.value = todayISO()
    this.purchaseFieldInstallmentsTarget.value = "1"
    this.purchaseFieldHasPaidTarget.checked = false
    this.purchaseFieldPaidWrapperTarget.hidden = true
    this.purchaseFieldPaidCountTarget.value = ""
    this.purchaseFieldThirdPartyTarget.value = ""
    this.purchaseFieldRefundTarget.checked = false
    this.togglePurchaseRefund()
    this.purchaseModalTarget.showModal()
    this.purchaseFieldDescriptionTarget.focus()
    this.loadKnownNames()
  }

  // Sugestões de "de outra pessoa" (nomes já usados).
  async loadKnownNames() {
    try {
      const resp = await this.authFetch("/api/debts")
      if (!resp.ok) return
      const data = await resp.json()
      this.thirdPartyNamesTarget.innerHTML = (data.known_names ?? [])
        .map((name) => `<option value="${escapeHtml(name)}"></option>`)
        .join("")
    } catch (err) {
      console.error("[cards] known names failed", err)
    }
  }

  togglePurchasePaid() {
    const on = this.purchaseFieldHasPaidTarget.checked
    this.purchaseFieldPaidWrapperTarget.hidden = !on
    if (on) this.purchaseFieldPaidCountTarget.focus()
    else this.purchaseFieldPaidCountTarget.value = ""
    this.updatePurchasePreview()
  }

  // Estorno é crédito à vista e sempre do próprio usuário: esconde parcelas,
  // "já paguei" e "de outra pessoa".
  togglePurchaseRefund() {
    const on = this.purchaseFieldRefundTarget.checked
    this.purchaseFieldInstallmentsWrapperTarget.hidden = on
    this.purchaseFieldHasPaidWrapperTarget.hidden = on
    this.purchaseFieldThirdPartyWrapperTarget.hidden = on
    if (on) {
      this.purchaseFieldInstallmentsTarget.value = "1"
      this.purchaseFieldHasPaidTarget.checked = false
      this.purchaseFieldThirdPartyTarget.value = ""
      this.togglePurchasePaid()
    } else {
      this.updatePurchasePreview()
    }
  }

  closePurchase() {
    this.purchaseModalTarget.close()
  }

  // A próxima parcela em aberto sempre cai no ciclo aberto; as seguintes,
  // um ciclo depois da outra.
  updatePurchasePreview() {
    const total   = parseFloat(this.purchaseFieldTotalTarget.value)
    const count   = parseInt(this.purchaseFieldInstallmentsTarget.value, 10)
    const hasPaid = this.purchaseFieldHasPaidTarget.checked
    const paid    = hasPaid ? parseInt(this.purchaseFieldPaidCountTarget.value, 10) : 0

    if (!total || !count || count < 1) {
      this.purchasePreviewTarget.hidden = true
      return
    }

    if (this.purchaseFieldRefundTarget.checked) {
      this.purchasePreviewTarget.innerHTML = `<strong>Crédito de ${formatBRL(total)}</strong> — abate do cartão neste ciclo`
      this.purchasePreviewTarget.hidden = false
      return
    }

    if (hasPaid && (!Number.isFinite(paid) || paid < 1 || paid >= count)) {
      this.purchasePreviewTarget.innerHTML = `<strong style="color:#b91c1c">Parcelas pagas deve ser entre 1 e ${count - 1}.</strong>`
      this.purchasePreviewTarget.hidden = false
      return
    }

    const base      = Math.floor((total / count) * 100) / 100
    const last      = Math.round((total - base * (count - 1)) * 100) / 100
    const remaining = count - paid

    let splitTxt
    if (remaining === 1)    splitTxt = `1× ${formatBRL(last)}`
    else if (base === last) splitTxt = `${remaining}× ${formatBRL(base)}`
    else                    splitTxt = `${remaining - 1}× ${formatBRL(base)} + 1× ${formatBRL(last)}`

    const startTxt = paid > 0 ? `começa na ${paid + 1}ª/${count} neste ciclo` : "primeira neste ciclo"
    const endTxt   = remaining > 1 ? `, última daqui a ${remaining - 1} ciclo(s)` : ""

    this.purchasePreviewTarget.innerHTML = `<strong>${splitTxt}</strong> — ${startTxt}${endTxt}`
    this.purchasePreviewTarget.hidden = false
  }

  async submitPurchase(event) {
    event.preventDefault()

    const cardId = this.purchaseCardIdTarget.value
    const installmentsCount = parseInt(this.purchaseFieldInstallmentsTarget.value, 10)
    const hasPaid = this.purchaseFieldHasPaidTarget.checked
    const installmentsPaid = hasPaid ? parseInt(this.purchaseFieldPaidCountTarget.value, 10) : 0

    if (hasPaid && (!Number.isFinite(installmentsPaid) || installmentsPaid < 1 || installmentsPaid >= installmentsCount)) {
      alert(`Parcelas já pagas deve ser entre 1 e ${installmentsCount - 1}.`)
      return
    }

    const payload = {
      description:        this.purchaseFieldDescriptionTarget.value.trim(),
      total_amount:       parseFloat(this.purchaseFieldTotalTarget.value) * (this.purchaseFieldRefundTarget.checked ? -1 : 1),
      installments_count: installmentsCount,
      installments_paid:  installmentsPaid,
      purchased_on:       this.purchaseFieldDateTarget.value || null,
      third_party_name:   this.purchaseFieldThirdPartyTarget.value.trim() || null,
    }

    this.setPurchaseSubmitting(true)
    try {
      const resp = await this.authFetch(`/api/cards/${cardId}/purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchase: payload }),
      })

      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        alert((data.errors || ["Erro ao lançar compra"]).join(", "))
        return
      }

      this.closePurchase()
      await this.loadInstallments(cardId)
      this.showNotice({ text: "Lançamento criado.", autoHideMs: 3500 })
      if (payload.third_party_name) window.dispatchEvent(new CustomEvent("debts:changed"))

      // Só em criação (não em edição/remoção) — o tour de onboarding ouve.
      window.dispatchEvent(new CustomEvent("purchase:created", {
        detail: { cardId, purchaseId: data.purchase?.id },
      }))
    } catch (err) {
      console.error("[cards] purchase failed", err)
      alert("Erro ao lançar a compra.")
    } finally {
      this.setPurchaseSubmitting(false)
    }
  }

  setPurchaseSubmitting(flag) {
    this.purchaseSubmitTarget.disabled = flag
    this.purchaseSubmitTarget.innerHTML = flag ? `<span class="spinner"></span> Lançando…` : `Lançar`
  }

  // ---- Notice (toast inline) ----

  showNotice({ text, autoHideMs = null }) {
    if (this.noticeHideTimer) clearTimeout(this.noticeHideTimer)
    this.noticeTextTarget.textContent = text
    this.noticeTarget.hidden = false
    if (autoHideMs) this.noticeHideTimer = setTimeout(() => this.dismissNotice(), autoHideMs)
  }

  dismissNotice() {
    if (this.noticeHideTimer) clearTimeout(this.noticeHideTimer)
    this.noticeTarget.hidden = true
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

    for (const card of this.cards) this.gridTarget.appendChild(this.buildCardEl(card))
  }

  buildCardEl(card) {
    const node = this.cardTemplateTarget.content.firstElementChild.cloneNode(true)
    node.dataset.cardId = card.id
    node.classList.add(card.mode === "debit" ? "card-item--debit" : "card-item--credit")
    if (card.color) node.style.background = card.color

    node.querySelector("[data-name]").textContent     = card.name || "—"
    node.querySelector("[data-bank]").textContent     = card.bank || ""
    node.querySelector("[data-mode]").textContent     = card.mode === "debit" ? "Débito" : "Crédito"
    node.querySelector("[data-pay-day]").textContent  = card.pay_day  ?? "—"
    node.querySelector("[data-best-day]").textContent = card.best_day ?? "—"

    // Itens e totais chegam em loadInstallments(cardId).
    node.querySelector("[data-items]").innerHTML = `<li style="opacity:0.5;font-style:italic;">Carregando…</li>`
    node.querySelector("[data-cycle-total]").textContent  = "—"
    node.querySelector("[data-future-total]").textContent = "—"
    this.applyCheck(node, card)

    if (!this.isOpen) {
      const text = this.cycle?.status === "closed" ? POPOVER_CLOSED_TEXT : POPOVER_UPCOMING_TEXT
      node.querySelectorAll(".card-item__actions button").forEach((btn) => {
        btn.disabled = true
        btn.dataset.controller = "popover"
        btn.dataset.popoverTextValue = text
      })
    }

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
    this.fieldColorTarget.value = "#1d4ed8"
  }

  parseDay(value) {
    const n = parseInt(value, 10)
    return Number.isFinite(n) && n >= 1 && n <= 31 ? n : null
  }

  setSubmitting(flag) {
    this.formSubmitTarget.disabled = flag
    this.formSubmitTarget.innerHTML = flag ? `<span class="spinner"></span> Salvando…` : `Salvar`
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

const POPOVER_CLOSED_TEXT   = "Ciclo fechado — não é possível alterar lançamentos."
const POPOVER_UPCOMING_TEXT = "Prévia de um ciclo futuro — lance compras no ciclo aberto."

const DOTS_PATH = `<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>`

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

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

// "12/out"
function formatShortDate(iso) {
  if (!iso) return "—"
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, "0")}/${MONTHS[d.getMonth()]}`
}

// Título da barra de navegação para o ciclo visualizado.
function cycleTitle(cycle) {
  if (cycle.status === "open")   return `Ciclo aberto · desde ${formatShortDate(cycle.started_at)}`
  if (cycle.status === "closed") return `${formatShortDate(cycle.started_at)} → ${formatShortDate(cycle.closed_at)}`
  const ahead = cycle.number - cycle.open_number
  return ahead === 1 ? "Próximo ciclo (prévia)" : `Daqui a ${ahead} ciclos (prévia)`
}

function cardMeta(card) {
  return `Fecha dia ${card.best_day ?? "—"} · vence dia ${card.pay_day ?? "—"}`
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function readCycleFromURL() {
  const n = parseInt(new URLSearchParams(window.location.search).get("cycle"), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function writeCycleToURL(number) {
  const url = new URL(window.location.href)
  url.searchParams.set("cycle", String(number))
  url.searchParams.delete("month")
  window.history.replaceState({}, "", url)
}
