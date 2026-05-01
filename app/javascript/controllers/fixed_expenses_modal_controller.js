import { Controller } from "@hotwired/stimulus"

// Modal dedicado de Contas Fixas. Responsável por TODAS as requests
// relacionadas a CRUD + status:
//   GET    /api/fixed_expenses?month=...
//   POST   /api/fixed_expenses
//   PATCH  /api/fixed_expenses/:id
//   DELETE /api/fixed_expenses/:id
//   PATCH  /api/fixed_expense_payments/:id  (paid toggle / amount pontual)
//
// Abre por evento "fixed-expenses:open-request" com { month } no detail.
// Após qualquer mutação dispatcha "fixed-expenses:changed" com totais
// atualizados — sidebar consome sem precisar refetchar.
export default class extends Controller {
  static targets = [
    "dialog", "monthLabel", "list", "empty", "total", "paid",
    "form", "formTitle", "formId", "fieldName", "fieldAmount", "fieldDueDay",
    "parceledBlock", "fieldParceled", "parceledFields",
    "fieldInstallmentsCount", "fieldInstallmentsPaid", "fieldNextDueMonth",
    "editNotice",
    "formCancel", "formSubmit", "addButton", "closedBanner",
  ]

  connect() {
    this.month = null
    this.items = []
    this.cycleClosed = false

    this.onOpen = (event) => this.open(event.detail?.month)
    window.addEventListener("fixed-expenses:open-request", this.onOpen)
  }

  disconnect() {
    window.removeEventListener("fixed-expenses:open-request", this.onOpen)
  }

  // ---- Abertura/Fechamento ----

  async open(month) {
    if (!month) return
    this.month = month
    this.monthLabelTarget.textContent = formatMonthLabel(month)
    this.resetForm()
    this.formTarget.hidden = true
    this.dialogTarget.showModal()
    await this.fetchList()
  }

  close() {
    this.dialogTarget.close()
  }

  // ---- Listagem ----

  async fetchList() {
    try {
      const resp = await this.authFetch(`/api/fixed_expenses?month=${this.month}`)
      if (!resp.ok) throw new Error(`GET fixed_expenses falhou: ${resp.status}`)
      const data = await resp.json()
      this.items = data.items ?? []
      this.cycleClosed = !!data.cycle_closed
      this.renderList(data)
      this.emitChanged({
        total: data.total,
        paidTotal: data.paid_total,
        pendingTotal: data.pending_total,
      })
    } catch (err) {
      console.error("[fixed-expenses-modal] fetch failed", err)
      this.listTarget.innerHTML = `<li class="fixed-expenses__error">Erro ao carregar.</li>`
    }
  }

  renderList(data) {
    this.closedBannerTarget.hidden = !this.cycleClosed
    this.addButtonTarget.disabled  = this.cycleClosed

    this.listTarget.innerHTML = ""
    if (this.items.length === 0) {
      this.emptyTarget.hidden = false
    } else {
      this.emptyTarget.hidden = true
      for (const item of this.items) {
        this.listTarget.appendChild(this.buildRow(item))
      }
    }

    this.totalTarget.textContent = formatBRL(data.total ?? 0)
    this.paidTarget.textContent  = formatBRL(data.paid_total ?? 0)
  }

  buildRow(item) {
    const li = document.createElement("li")
    li.className = "fixed-expenses__item" + (item.paid_at ? " fixed-expenses__item--paid" : "")
    li.dataset.paymentId = item.payment_id
    li.dataset.expenseId = item.expense_id

    const dueTxt  = item.due_day ? `Vence dia ${item.due_day}` : "Sem vencimento"
    const paidTxt = item.paid_at
      ? `✓ Pago em ${formatDate(item.paid_at)}`
      : "Marcar pago"

    const installmentTxt = item.installments_count
      ? ` <span class="fixed-expenses__installment">${item.installment_number}/${item.installments_count}</span>`
      : ""

    li.innerHTML = `
      <div class="fixed-expenses__item-info">
        <strong class="fixed-expenses__item-name">${escapeHtml(item.name)}${installmentTxt}</strong>
        <span class="fixed-expenses__item-due">${escapeHtml(dueTxt)}</span>
      </div>
      <div class="fixed-expenses__item-amount">${formatBRL(item.amount)}</div>
      <div class="fixed-expenses__item-actions">
        <button type="button" class="fixed-expenses__btn-paid" data-action="click->fixed-expenses-modal#togglePaid"
                ${item.cycle_closed ? "disabled" : ""}>${escapeHtml(paidTxt)}</button>
        <button type="button" class="fixed-expenses__btn-edit"   data-action="click->fixed-expenses-modal#openEdit"
                title="Editar" aria-label="Editar"
                ${item.cycle_closed ? "disabled" : ""}>✏️</button>
        <button type="button" class="fixed-expenses__btn-remove" data-action="click->fixed-expenses-modal#remove"
                title="Remover" aria-label="Remover"
                ${item.cycle_closed ? "disabled" : ""}>🗑️</button>
      </div>
    `
    return li
  }

  // ---- Form (criar/editar) ----

  openCreate() {
    if (this.cycleClosed) return
    this.resetForm()
    this.formTitleTarget.textContent = "Nova conta fixa"
    // Bloco de parcelamento disponível só no create.
    this.parceledBlockTarget.hidden = false
    this.editNoticeTarget.hidden = true
    this.formTarget.hidden = false
    this.fieldNameTarget.focus()
  }

  openEdit(event) {
    const li = event.currentTarget.closest(".fixed-expenses__item")
    const item = this.items.find((i) => i.expense_id === li.dataset.expenseId)
    if (!item) return

    this.resetForm()
    this.formTitleTarget.textContent = "Editar conta fixa"
    this.formIdTarget.value      = item.expense_id
    this.fieldNameTarget.value   = item.name
    this.fieldAmountTarget.value = item.amount
    this.fieldDueDayTarget.value = item.due_day ?? ""

    // Edição não permite mexer em parcelamento — esconde o bloco e mostra
    // aviso quando a compra é parcelada.
    this.parceledBlockTarget.hidden = true
    if (item.installments_count) {
      const num = item.installment_number ?? "?"
      this.editNoticeTarget.innerHTML =
        `Compra parcelada (${num}/${item.installments_count}). Pra mudar parcelamento, remova e recrie.`
      this.editNoticeTarget.hidden = false
    } else {
      this.editNoticeTarget.hidden = true
    }

    this.formTarget.hidden = false
    this.fieldNameTarget.focus()
    this.fieldNameTarget.select()
  }

  toggleParceled() {
    const on = this.fieldParceledTarget.checked
    this.parceledFieldsTarget.hidden = !on
    if (on && !this.fieldNextDueMonthTarget.value) {
      const d = new Date()
      this.fieldNextDueMonthTarget.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    }
  }

  closeForm() {
    this.formTarget.hidden = true
  }

  async submitForm(event) {
    event.preventDefault()

    const id = this.formIdTarget.value
    const payload = {
      name:    this.fieldNameTarget.value.trim(),
      amount:  parseFloat(this.fieldAmountTarget.value),
      due_day: this.parseDay(this.fieldDueDayTarget.value),
    }

    // Campos de parcelamento: só envia no create e quando checkbox marcado.
    // Update silenciosamente ignora — backend já só permite name/amount/due_day.
    if (!id && this.fieldParceledTarget.checked) {
      const total = parseInt(this.fieldInstallmentsCountTarget.value, 10)
      const paid  = parseInt(this.fieldInstallmentsPaidTarget.value, 10) || 0
      const ndm   = this.fieldNextDueMonthTarget.value
      if (!Number.isFinite(total) || total < 2) {
        alert("Total de parcelas precisa ser ao menos 2.")
        return
      }
      if (paid < 0 || paid >= total) {
        alert(`Já paguei deve estar entre 0 e ${total - 1}.`)
        return
      }
      if (!ndm) {
        alert("Informe o mês da próxima parcela a vencer.")
        return
      }
      payload.installments_count = total
      payload.installments_paid  = paid
      payload.next_due_month     = ndm + "-01"
    }

    this.setSubmitting(true)
    try {
      const url    = id ? `/api/fixed_expenses/${id}` : `/api/fixed_expenses`
      const method = id ? "PATCH" : "POST"
      const resp = await this.authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixed_expense: payload, month: this.month }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        alert((data.errors || ["Erro ao salvar"]).join(", "))
        return
      }
      this.closeForm()
      await this.fetchList()
    } catch (err) {
      console.error("[fixed-expenses-modal] submit failed", err)
      alert("Erro ao salvar.")
    } finally {
      this.setSubmitting(false)
    }
  }

  // ---- Toggle pago ----

  async togglePaid(event) {
    const btn = event.currentTarget
    if (btn.disabled) return
    btn.disabled = true

    const li = btn.closest(".fixed-expenses__item")
    const item = this.items.find((i) => i.payment_id === li.dataset.paymentId)
    if (!item) { btn.disabled = false; return }

    try {
      const resp = await this.authFetch(`/api/fixed_expense_payments/${item.payment_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid: !item.paid_at }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        alert((data.errors || ["Erro ao atualizar"]).join(", "))
        return
      }
      await this.fetchList()
    } catch (err) {
      console.error("[fixed-expenses-modal] togglePaid failed", err)
      alert("Erro ao atualizar.")
    } finally {
      btn.disabled = false
    }
  }

  // ---- Remover ----

  async remove(event) {
    const li = event.currentTarget.closest(".fixed-expenses__item")
    const item = this.items.find((i) => i.expense_id === li.dataset.expenseId)
    if (!item) return
    if (!confirm(`Remover "${item.name}"? Histórico em ciclos fechados é preservado.`)) return

    try {
      const resp = await this.authFetch(`/api/fixed_expenses/${item.expense_id}`, { method: "DELETE" })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        alert((data.errors || ["Erro ao remover"]).join(", "))
        return
      }
      await this.fetchList()
    } catch (err) {
      console.error("[fixed-expenses-modal] remove failed", err)
      alert("Erro ao remover.")
    }
  }

  // ---- Helpers ----

  resetForm() {
    this.formTarget.reset()
    this.formIdTarget.value = ""
    this.fieldParceledTarget.checked = false
    this.parceledFieldsTarget.hidden = true
    this.editNoticeTarget.hidden = true
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

  emitChanged({ total, paidTotal, pendingTotal }) {
    window.dispatchEvent(new CustomEvent("fixed-expenses:changed", {
      detail: {
        month:        this.month,
        total:        total,
        paidTotal:    paidTotal,
        pendingTotal: pendingTotal,
      },
    }))
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

function formatDate(value) {
  if (!value) return ""
  const d = new Date(value)
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

function formatMonthLabel(ymd) {
  const [y, m] = String(ymd).split("-").map((v) => parseInt(v, 10))
  if (!Number.isFinite(y) || !Number.isFinite(m)) return ""
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
