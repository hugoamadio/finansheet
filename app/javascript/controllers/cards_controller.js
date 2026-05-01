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
    "fieldName", "fieldBank", "fieldMode", "fieldPayDay", "fieldBestDay", "fieldColor",
    "purchaseModal", "purchaseForm", "purchaseSubmit", "purchaseCardId",
    "purchaseCardHeader", "purchaseCardName", "purchaseCardBank", "purchaseCardMeta",
    "purchaseFieldDescription", "purchaseFieldTotal", "purchaseFieldInstallments",
    "purchaseFieldHasPaid", "purchaseFieldPaidWrapper", "purchaseFieldPaidCount",
    "purchaseFieldDateWrapper", "purchaseFieldDate",
    "purchaseFieldNextDueWrapper", "purchaseFieldNextDue",
    "purchasePreview",
    "monthLabel", "prevButton", "closedTag", "closeCycleButton", "closeCycleIcon", "closeCycleLabel",
    "closeCycleModal", "closeCycleMonth", "closeCycleSummary", "closeCycleConfirm",
    "notice", "noticeText", "noticeAction",
  ]

  connect() {
    this.cards = []
    this.installmentsByCard = {}
    // Sem URL param o backend resolve o ciclo ativo (1º aberto ≥ hoje) e
    // devolve em data.month — adotamos isso como currentMonth no boot.
    this.currentMonth = readMonthFromURL()
    this.monthClosedAt = null
    this.hasEarlierData = false
    this.expectedIncome = null

    // Os modais de editar/remover compra e o de income moram em controllers
    // próprios. Aqui só ouvimos os eventos que eles disparam pra recarregar
    // o que muda — purchase mexe nos totais do card; income atualiza o resumo.
    this.onPurchaseChanged = (event) => {
      const cardId = event.detail?.cardId
      if (cardId) this.loadInstallments(cardId)
    }
    this.onIncomeChanged = (event) => {
      // Atualiza o resumo só quando o evento é do mês visualizado.
      const eventMonth = event.detail?.month
      if (!eventMonth || eventMonth !== formatYMD(this.currentMonth)) return
      this.expectedIncome = event.detail.amount
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

  // ---- API: cards (metadata + globals do mês) ----

  async loadCards({ withFade = false } = {}) {
    if (withFade) this.gridTarget.classList.add("cards-grid--fading")
    else this.showLoading()

    try {
      const url = this.currentMonth
        ? `/api/cards?month=${formatYMD(this.currentMonth)}`
        : `/api/cards`
      const resp = await this.authFetch(url)
      if (!resp.ok) throw new Error(`GET /api/cards falhou: ${resp.status}`)
      const data = await resp.json()
      // Boot sem URL param: adota o ciclo ativo que o backend resolveu e
      // sincroniza com a URL pra sobreviver F5.
      if (!this.currentMonth) {
        this.currentMonth = parseYMD(data.month) ?? firstDayOfCurrentMonth()
        writeMonthToURL(this.currentMonth)
      }
      this.cards = data.cards ?? []
      this.hasEarlierData = !!data.has_earlier_data
      this.monthClosedAt  = data.month_closed_at
      this.expectedIncome = data.expected_income ?? null
      this.installmentsByCard = {}
      this.render()
      this.renderMonthNav()
      this.emitSummaryUpdate()
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

    const cardId = cardEl.dataset.cardId
    const monthClosed = !!this.monthClosedAt

    for (const inst of data.month_installments ?? []) {
      const fraction = inst.installments_count === 1
        ? "x1"
        : `${inst.number}/${inst.installments_count}`

      const li = document.createElement("li")
      if (inst.excluded_from_summary) li.classList.add("card-item__items-row--excluded")
      li.appendChild(buildItemLabel(inst.description, fraction))
      li.appendChild(buildItemAmount(inst.amount))
      li.appendChild(buildItemActions({ inst, cardId, monthClosed, controller: this }))
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

    // Saldo do mês depende do total de cada card; reemite o resumo a cada chegada.
    this.emitSummaryUpdate()
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

  // ---- Resumo do ciclo (sidebar) ----

  // Empacota o estado do mês visualizado e emite "cycle:summary-update" pro
  // cycle_summary_controller (que vive na sidebar) renderizar. Disparado em:
  // - chegada de /api/cards (mês trocou ou boot)
  // - chegada de /api/cards/:id/installments (totais por card chegaram)
  // - "income:changed" (usuário definiu/editou A receber)
  emitSummaryUpdate() {
    if (!this.currentMonth) return

    const cardLines = this.cards
      .map((c) => {
        const data = this.installmentsByCard[c.id]
        // fallback pra month_total durante deploy onde o backend ainda não
        // devolve o campo novo.
        const total = Number(data?.month_total_for_summary ?? data?.month_total ?? 0)
        return { name: c.name, total }
      })
      .filter((l) => l.total > 0)

    window.dispatchEvent(new CustomEvent("cycle:summary-update", {
      detail: {
        month:          formatYMD(this.currentMonth),
        monthLabel:     formatCycleLabel(this.currentMonth),
        expectedIncome: this.expectedIncome,
        monthClosed:    !!this.monthClosedAt,
        cardLines,
      },
    }))
  }

  renderMonthNav() {
    this.monthLabelTarget.textContent = formatCycleLabel(this.currentMonth)
    this.prevButtonTarget.disabled = !this.canGoBack()

    const closed = !!this.monthClosedAt
    this.closedTagTarget.hidden = !closed
    this.closeCycleButtonTarget.disabled = closed
    this.closeCycleLabelTarget.textContent = closed ? "Ciclo fechado" : "Virar Ciclo"
    this.closeCycleIconTarget.innerHTML = closed
      ? CLOSE_CYCLE_LOCKED_SVG
      : CLOSE_CYCLE_ACTIVE_SVG
  }

  // ---- Modal "Virar Ciclo" ----

  openCloseCycle() {
    if (this.monthClosedAt) return

    this.closeCycleMonthTarget.textContent = formatMonthLabel(this.currentMonth)

    const summaryTotalFor = (cardId) => {
      const data = this.installmentsByCard[cardId]
      return Number(data?.month_total_for_summary ?? data?.month_total ?? 0)
    }

    const lines = this.cards
      .map((c) => ({ name: c.name, total: summaryTotalFor(c.id) }))
      .filter((row) => row.total > 0)
      .map((row) => `<div style="display:flex;justify-content:space-between"><span>${escapeHtml(row.name || "—")}</span><strong>${formatBRL(row.total)}</strong></div>`)

    const grandTotal = this.cards.reduce((sum, c) => sum + summaryTotalFor(c.id), 0)
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
        alert((data.errors || ["Erro ao virar o ciclo"]).join(", "))
        return
      }
      this.closeCloseCycleModal()
      await this.loadCards({ withFade: true })
    } catch (err) {
      console.error("[cards] close cycle failed", err)
      alert("Erro ao virar o ciclo.")
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
      color:    this.fieldColorTarget.value,
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
    this.fieldColorTarget.value     = card.color ?? "#1d4ed8"

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
    this.purchaseCardHeaderTarget.style.background = card.color || ""

    const today = new Date()
    this.purchaseFieldDateTarget.value = today.toISOString().slice(0, 10)
    this.purchaseFieldNextDueTarget.value = today.toISOString().slice(0, 7)
    this.purchaseFieldInstallmentsTarget.value = "1"
    this.purchaseFieldHasPaidTarget.checked = false
    this.purchaseFieldPaidWrapperTarget.hidden = true
    this.purchaseFieldPaidCountTarget.value = ""
    this.purchaseFieldDateWrapperTarget.hidden = false
    this.purchaseFieldNextDueWrapperTarget.hidden = true

    this.updatePurchasePreview()
    this.purchaseModalTarget.showModal()
    this.purchaseFieldDescriptionTarget.focus()
  }

  // Marcar "já paguei N" troca o campo de data: em vez de pedir a data
  // (potencialmente esquecida) da compra original, pedimos só o mês da
  // próxima parcela a vencer — informação que o usuário sempre sabe.
  togglePurchasePaid() {
    const on = this.purchaseFieldHasPaidTarget.checked
    this.purchaseFieldPaidWrapperTarget.hidden = !on
    this.purchaseFieldDateWrapperTarget.hidden = on
    this.purchaseFieldNextDueWrapperTarget.hidden = !on
    if (on) {
      this.purchaseFieldPaidCountTarget.focus()
    } else {
      this.purchaseFieldPaidCountTarget.value = ""
    }
    this.updatePurchasePreview()
  }

  closePurchase() {
    this.purchaseModalTarget.close()
  }

  updatePurchasePreview() {
    const total = parseFloat(this.purchaseFieldTotalTarget.value)
    const count = parseInt(this.purchaseFieldInstallmentsTarget.value, 10)
    const cardId = this.purchaseCardIdTarget.value
    const card = this.cards.find((c) => c.id === cardId)
    const hasPaid = this.purchaseFieldHasPaidTarget.checked
    const paid = hasPaid
      ? parseInt(this.purchaseFieldPaidCountTarget.value, 10)
      : 0

    if (!total || !count || count < 1 || !card?.best_day) {
      this.purchasePreviewTarget.hidden = true
      return
    }

    if (hasPaid && (!Number.isFinite(paid) || paid < 1 || paid >= count)) {
      this.purchasePreviewTarget.innerHTML = `<strong style="color:#b91c1c">Parcelas pagas deve ser entre 1 e ${count - 1}.</strong>`
      this.purchasePreviewTarget.hidden = false
      return
    }

    // firstDue = mês da parcela paid+1 (ou parcela 1 se paid=0).
    // - hasPaid: usuário escolhe direto o mês da próxima parcela em aberto
    // - sem hasPaid: deriva do mês da compra (ou hoje se vazio)
    let firstDue
    if (hasPaid) {
      const monthStr = this.purchaseFieldNextDueTarget.value || todayYM()
      const [y, m] = monthStr.split("-").map((v) => parseInt(v, 10))
      firstDue = new Date(y, m - 1, 1)
    } else {
      const dateStr = this.purchaseFieldDateTarget.value
      const purchaseDate = dateStr ? new Date(dateStr + "T00:00:00") : new Date()
      firstDue = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth(), 1)
    }

    const baseAmount = Math.floor((total / count) * 100) / 100
    const lastAmount = Math.round((total - baseAmount * (count - 1)) * 100) / 100
    const remaining  = count - paid
    const lastDue    = new Date(firstDue.getFullYear(), firstDue.getMonth() + remaining - 1, 1)

    const fmtMonth = (d) => d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
    const fmtMoney = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

    const splitTxt = baseAmount === lastAmount
      ? `${remaining}× ${fmtMoney(baseAmount)}`
      : `${remaining - 1}× ${fmtMoney(baseAmount)} + 1× ${fmtMoney(lastAmount)}`

    const startTxt = paid > 0
      ? `começa na ${paid + 1}ª/${count} em ${fmtMonth(firstDue)}`
      : `primeira em ${fmtMonth(firstDue)}`

    this.purchasePreviewTarget.innerHTML = `<strong>${splitTxt}</strong> — ${startTxt}, última em ${fmtMonth(lastDue)}`
    this.purchasePreviewTarget.hidden = false
  }

  async submitPurchase(event) {
    event.preventDefault()

    const cardId = this.purchaseCardIdTarget.value
    const installmentsCount = parseInt(this.purchaseFieldInstallmentsTarget.value, 10)
    const hasPaid = this.purchaseFieldHasPaidTarget.checked
    const installmentsPaid  = hasPaid
      ? parseInt(this.purchaseFieldPaidCountTarget.value, 10)
      : 0

    if (hasPaid &&
        (!Number.isFinite(installmentsPaid) || installmentsPaid < 1 || installmentsPaid >= installmentsCount)) {
      alert(`Parcelas já pagas deve ser entre 1 e ${installmentsCount - 1}.`)
      return
    }

    const payload = {
      description:        this.purchaseFieldDescriptionTarget.value.trim(),
      total_amount:       parseFloat(this.purchaseFieldTotalTarget.value),
      installments_count: installmentsCount,
      installments_paid:  installmentsPaid,
    }
    // Envia só o campo de data relevante. Backend aceita ambos opcionais e
    // faz fallback pra hoje quando nenhum vier.
    if (hasPaid) {
      // type=month vem como "YYYY-MM"; backend faz beginning_of_month.
      if (this.purchaseFieldNextDueTarget.value) {
        payload.next_due_month = this.purchaseFieldNextDueTarget.value + "-01"
      }
    } else if (this.purchaseFieldDateTarget.value) {
      payload.purchased_on = this.purchaseFieldDateTarget.value
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

  // Liga/desliga "não considerar no resumo do ciclo" pra uma compra inteira.
  // O totalizador do cartão (mês/aberto) continua somando — só a sidebar e o
  // resumo do "Virar Ciclo" deixam de contar. Permitido em qualquer estado
  // (mês fechado / parcela em ciclo fechado) — flag puramente visual.
  async toggleExcluded(cardId, purchaseId, currentValue) {
    try {
      const resp = await this.authFetch(`/api/cards/${cardId}/purchases/${purchaseId}/toggle_excluded`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excluded_from_summary: !currentValue }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        alert((data.errors || ["Erro ao atualizar"]).join(", "))
        return
      }
      await this.loadInstallments(cardId)
    } catch (err) {
      console.error("[cards] toggle_excluded failed", err)
      alert("Erro ao atualizar a flag.")
    }
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
    if (card.color) node.style.background = card.color

    node.querySelector("[data-name]").textContent = card.name || "—"
    node.querySelector("[data-bank]").textContent = card.bank || ""
    node.querySelector("[data-mode]").textContent = card.mode === "debit" ? "Débito" : "Crédito"
    node.querySelector("[data-pay-day]").textContent  = card.pay_day  ?? "—"
    node.querySelector("[data-best-day]").textContent = card.best_day ?? "—"

    // Items + totais ficam vazios — populados em loadInstallments(cardId)
    node.querySelector("[data-items]").innerHTML = `<li style="opacity:0.5;font-style:italic;">Carregando…</li>`
    node.querySelector("[data-month-total]").textContent = "—"
    node.querySelector("[data-total-open]").textContent  = "—"

    if (this.monthClosedAt) {
      node.querySelectorAll(".card-item__actions button").forEach((btn) => {
        btn.disabled = true
        btn.dataset.controller = "popover"
        btn.dataset.popoverTextValue = POPOVER_CLOSED_MONTH_TEXT
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

// === Construção dos itens de installment ===
//
// Quem dispatcha o evento sou eu; o purchase_edit/purchase_remove controllers
// (cada um no seu arquivo) ouvem e abrem seus modais. Isso mantém os modais
// independentes de mim — só sei o nome do evento e o shape do detail.

const POPOVER_BLOCKED_TEXT =
  "Não é possível editar/excluir essa compra: ela tem parcelas em ciclos anteriores já fechados."

const POPOVER_CLOSED_MONTH_TEXT =
  "Ciclo fechado — não é possível alterar lançamentos."

function buildItemLabel(description, fraction) {
  const span = document.createElement("span")
  span.className = "card-item__item-label"
  span.innerHTML = `${escapeHtml(description)}<span class="card-item__item-installment">${fraction}</span>`
  return span
}

function buildItemAmount(amount) {
  const span = document.createElement("span")
  span.className = "card-item__item-amount"
  span.textContent = formatBRL(amount)
  return span
}

function buildItemActions({ inst, cardId, monthClosed, controller }) {
  const wrap = document.createElement("span")
  wrap.className = "card-item__item-actions"

  wrap.appendChild(buildExcludeToggle({ inst, cardId, controller }))

  wrap.appendChild(buildActionButton({
    iconPath:    PENCIL_PATH,
    title:       "Editar compra",
    eventName:   "purchase:edit-request",
    inst, cardId, monthClosed,
  }))

  wrap.appendChild(buildActionButton({
    iconPath:    TRASH_PATH,
    title:       "Remover compra",
    eventName:   "purchase:remove-request",
    extraClass:  "card-item__item-action--danger",
    inst, cardId, monthClosed,
  }))

  return wrap
}

// Botão de "ignorar no resumo do ciclo". Sempre clicável (não respeita
// monthClosed nem purchase_editable — flag não altera valores).
// Tooltip muda de texto conforme o estado atual da compra.
function buildExcludeToggle({ inst, cardId, controller }) {
  const excluded = !!inst.excluded_from_summary
  const btn = document.createElement("button")
  btn.type = "button"
  btn.className = `card-item__item-action ${excluded ? "card-item__item-action--excluded-on" : ""}`.trim()
  const title = excluded
    ? "Esta compra está ignorada no resumo do ciclo (saldo da sidebar). Continua somando no Mês/Total aberto do cartão. Clique pra voltar a considerar."
    : "Não considerar essa compra no resumo do ciclo (saldo da sidebar). Mesmo ignorada, ela continua somando no Mês/Total aberto do cartão. Útil pra compras parceladas que você não quer ver afetando o saldo do mês."
  btn.title = title
  btn.setAttribute("aria-label", excluded ? "Voltar a considerar no resumo" : "Não considerar no resumo")
  btn.dataset.controller = "popover"
  btn.dataset.popoverTextValue = title
  btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${excluded ? EYE_OFF_PATH : EYE_PATH}</svg>`
  // Guard contra double-click: enquanto a request está em andamento, o
  // botão fica disabled. Após sucesso, loadInstallments re-renderiza o
  // <li> inteiro (substitui o botão), então o estado disabled é descartado
  // junto. Em caso de erro mantemos a referência viva e re-habilitamos.
  btn.addEventListener("click", async () => {
    if (btn.disabled) return
    btn.disabled = true
    try {
      await controller.toggleExcluded(cardId, inst.purchase_id, excluded)
    } finally {
      btn.disabled = false
    }
  })
  return btn
}

function buildActionButton({ iconPath, title, eventName, inst, cardId, monthClosed, extraClass = "" }) {
  const btn = document.createElement("button")
  btn.type = "button"
  btn.className = `card-item__item-action ${extraClass}`.trim()
  btn.title = title
  btn.setAttribute("aria-label", title)
  btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${iconPath}</svg>`

  // Ciclo fechado tem prioridade na mensagem — é o motivo "macro" de bloqueio.
  // Se ainda for parcelada com ciclo anterior fechado, cai no popover dela.
  if (monthClosed) {
    btn.disabled = true
    btn.dataset.controller = "popover"
    btn.dataset.popoverTextValue = POPOVER_CLOSED_MONTH_TEXT
  } else if (inst.purchase_editable === false) {
    btn.disabled = true
    btn.dataset.controller = "popover"
    btn.dataset.popoverTextValue = POPOVER_BLOCKED_TEXT
  } else {
    btn.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent(eventName, {
        detail: {
          cardId,
          purchaseId:        inst.purchase_id,
          description:       inst.description,
          totalAmount:       inst.purchase_total_amount,
          installmentsCount: inst.installments_count,
        },
      }))
    })
  }

  return btn
}

// SVGs do botão "Virar Ciclo": ativo (seta circular) vs fechado (cadeado).
const CLOSE_CYCLE_ACTIVE_SVG = `<polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 18 6.36L23 10"/>`
const CLOSE_CYCLE_LOCKED_SVG = `<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`

const PENCIL_PATH = `<path d="M4 20h4l10.5-10.5a2.121 2.121 0 0 0-3-3L5 17v3z"/><path d="M14.5 5.5l3 3"/>`
const TRASH_PATH  = `<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>`
const EYE_PATH     = `<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`
const EYE_OFF_PATH = `<path d="M2 12s3.5-7 10-7c2.2 0 4.1.7 5.7 1.7"/><path d="M22 12s-3.5 7-10 7c-2.2 0-4.1-.7-5.7-1.7"/><line x1="3" y1="3" x2="21" y2="21"/>`

function firstDayOfCurrentMonth() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function todayYM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
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

// Label específico da barra de navegação ("Ciclo abril - 2026"). Os usos em
// frases corridas (modal de fechar ciclo, notice) seguem com formatMonthLabel
// pra ler natural ("fechar o ciclo de abril de 2026").
function formatCycleLabel(date) {
  const month = date.toLocaleDateString("pt-BR", { month: "long" })
  return `Ciclo ${month} - ${date.getFullYear()}`
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
