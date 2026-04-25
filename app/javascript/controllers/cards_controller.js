import { Controller } from "@hotwired/stimulus"

// Página inicial: grid de cartões + CRUD via modal.
// Padrão do projeto: lista vem de fetch após render (não server-render).
export default class extends Controller {
  static targets = [
    "grid", "loading", "cardTemplate",
    "formModal", "formTitle", "form", "formId", "formSubmit",
    "fieldName", "fieldBank", "fieldMode", "fieldPayDay", "fieldBestDay",
    "purchaseModal", "purchaseForm", "purchaseSubmit", "purchaseCardId",
    "purchaseCardHeader", "purchaseCardName", "purchaseCardBank", "purchaseCardMeta",
    "purchaseFieldDescription", "purchaseFieldTotal", "purchaseFieldInstallments",
    "purchaseFieldDate", "purchasePreview",
  ]

  connect() {
    this.cards = []
    this.loadCards()
  }

  // ---- API ----

  async loadCards() {
    this.showLoading()
    try {
      const resp = await this.authFetch("/api/cards")
      if (!resp.ok) throw new Error(`GET /api/cards falhou: ${resp.status}`)
      const data = await resp.json()
      this.cards = data.cards ?? []
      this.render()
    } catch (err) {
      console.error("[cards] load failed", err)
      this.gridTarget.innerHTML = `<div class="cards-grid__empty">Erro carregando cartões.</div>`
    }
  }

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

  // ---- Modal: criar/editar ----

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

    // default: hoje + 1 parcela
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

    // mesmo split do CardPurchaseForm: floor(2) nas N-1, última absorve o resto
    const baseAmount = Math.floor((total / count) * 100) / 100
    const lastAmount = Math.round((total - baseAmount * (count - 1)) * 100) / 100

    // due_month: se compra <= best_day → mês seguinte; senão → 2 meses depois
    const purchaseDate = new Date(dateStr + "T00:00:00")
    const day = purchaseDate.getDate()
    const offsetMonths = day <= card.best_day ? 1 : 2
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
      // Fase C usa esse refresh pra repintar o card com novos itens
      await this.loadCards()
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
    return node
  }

  showLoading() {
    this.gridTarget.innerHTML = `<div class="cards-grid__loading"><span class="spinner"></span> Carregando cartões…</div>`
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
