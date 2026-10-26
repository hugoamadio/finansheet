import { Controller } from "@hotwired/stimulus"

// Menu de ações de uma compra (botão "⋯" de cada linha do cartão).
// Componente independente:
// - Abre com "purchase:menu-request" ({ cardId, cycleStatus, inst, anchor })
// - Editar/apagar reaproveitam os modais existentes
//   ("purchase:edit-request" / "purchase:remove-request")
// - Quitar, desfazer quitação, cancelar o restante e "de outra pessoa"
//   chamam a API aqui e avisam com "purchase:changed" + "debts:changed"
// Fora do ciclo aberto só "de outra pessoa" aparece (não muda valores).
export default class extends Controller {
  static targets = [
    "menu",
    "cancelDialog", "cancelSummary", "cancelFrom", "cancelSubmit",
    "thirdPartyDialog", "thirdPartySummary", "thirdPartyInput", "thirdPartyNames", "thirdPartyPercent", "thirdPartySubmit",
  ]

  connect() {
    this.current = null
    this.anchor = null

    this.onRequest = (event) => this.open(event.detail)
    this.onOutside = (event) => {
      if (this.menuTarget.hidden) return
      if (this.menuTarget.contains(event.target) || this.anchor?.contains(event.target)) return
      this.closeMenu()
    }
    this.onKey = (event) => {
      if (event.key === "Escape") this.closeMenu()
    }

    window.addEventListener("purchase:menu-request", this.onRequest)
    document.addEventListener("click", this.onOutside, true)
    document.addEventListener("keydown", this.onKey)
  }

  disconnect() {
    window.removeEventListener("purchase:menu-request", this.onRequest)
    document.removeEventListener("click", this.onOutside, true)
    document.removeEventListener("keydown", this.onKey)
  }

  open({ cardId, cycleStatus, inst, anchor }) {
    // Segundo clique no mesmo "⋯" fecha.
    if (this.anchor === anchor && !this.menuTarget.hidden) {
      this.closeMenu()
      return
    }

    this.current = { cardId, inst }
    this.anchor = anchor

    const open  = cycleStatus === "open"
    const items = []
    if (open && inst.editable) {
      if (!inst.refund) items.push(["Editar", () => this.emit("purchase:edit-request")])
      items.push(["Apagar", () => this.emit("purchase:remove-request"), "danger"])
    }
    if (open && inst.can_prepay)      items.push(["Quitar o restante", () => this.prepay()])
    if (open && inst.can_undo_prepay) items.push(["Desfazer quitação", () => this.call("DELETE", "prepay")])
    if (open && inst.cancel_from)     items.push(["Cancelar o restante…", () => this.openCancel()])
    if (!inst.refund) items.push([inst.third_party_name ? "Mudar a pessoa ou a divisão…" : "De outra pessoa ou dividir…", () => this.openThirdParty()])
    // Estorno em ciclo fechado não tem ação nenhuma.
    if (items.length === 0) return

    this.menuTarget.innerHTML = ""
    for (const [label, action, variant] of items) {
      const btn = document.createElement("button")
      btn.type = "button"
      btn.setAttribute("role", "menuitem")
      btn.className = variant ? `purchase-menu__item purchase-menu__item--${variant}` : "purchase-menu__item"
      btn.textContent = label
      btn.addEventListener("click", () => {
        this.closeMenu()
        action()
      })
      this.menuTarget.appendChild(btn)
    }

    this.menuTarget.hidden = false
    this.position(anchor)
  }

  // Abaixo do botão, alinhado pela direita; acima se não couber.
  position(anchor) {
    const rect = anchor.getBoundingClientRect()
    const menu = this.menuTarget
    const left = Math.max(8, Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8))
    let top = rect.bottom + 4
    if (top + menu.offsetHeight > window.innerHeight - 8) top = rect.top - menu.offsetHeight - 4
    menu.style.left = `${left}px`
    menu.style.top  = `${Math.max(8, top)}px`
  }

  closeMenu() {
    this.menuTarget.hidden = true
    this.anchor = null
  }

  emit(eventName) {
    const { cardId, inst } = this.current
    window.dispatchEvent(new CustomEvent(eventName, {
      detail: {
        cardId,
        purchaseId:        inst.purchase_id,
        description:       inst.description,
        totalAmount:       inst.purchase_total_amount,
        installmentsCount: inst.installments_count,
      },
    }))
  }

  async prepay() {
    const { inst } = this.current
    if (!confirm(`Quitar o restante de "${inst.description}"? As parcelas futuras entram no ciclo aberto.`)) return
    await this.call("POST", "prepay")
  }

  // ---- Cancelar o restante ----

  openCancel() {
    const { inst } = this.current
    this.cancelSummaryTarget.textContent = `${inst.description} — ${inst.installments_count} parcelas`
    this.cancelFromTarget.innerHTML = ""
    for (let n = inst.cancel_from; n <= inst.installments_count; n++) {
      const option = document.createElement("option")
      option.value = String(n)
      option.textContent = `${n}ª parcela`
      this.cancelFromTarget.appendChild(option)
    }
    this.cancelDialogTarget.showModal()
  }

  closeCancel() {
    this.cancelDialogTarget.close()
  }

  async submitCancel(event) {
    event.preventDefault()
    this.cancelSubmitTarget.disabled = true
    const ok = await this.call("POST", "cancel_remaining", { from_number: parseInt(this.cancelFromTarget.value, 10) })
    this.cancelSubmitTarget.disabled = false
    if (ok) this.closeCancel()
  }

  // ---- De outra pessoa ----

  openThirdParty() {
    const { inst } = this.current
    this.thirdPartySummaryTarget.textContent = inst.description
    this.thirdPartyInputTarget.value = inst.third_party_name ?? ""
    this.thirdPartyPercentTarget.value = String(inst.third_party_name ? inst.third_party_percent ?? 100 : 100)
    this.thirdPartyDialogTarget.showModal()
    this.thirdPartyInputTarget.focus()
    this.loadKnownNames()
  }

  closeThirdParty() {
    this.thirdPartyDialogTarget.close()
  }

  async submitThirdParty(event) {
    event.preventDefault()
    this.thirdPartySubmitTarget.disabled = true
    const ok = await this.call("PATCH", "third_party", {
      third_party_name:    this.thirdPartyInputTarget.value.trim(),
      third_party_percent: parseInt(this.thirdPartyPercentTarget.value, 10),
    })
    this.thirdPartySubmitTarget.disabled = false
    if (ok) this.closeThirdParty()
  }

  async loadKnownNames() {
    try {
      const resp = await this.authFetch("/api/debts")
      if (!resp.ok) return
      const data = await resp.json()
      this.thirdPartyNamesTarget.innerHTML = (data.known_names ?? [])
        .map((name) => `<option value="${escapeHtml(name)}"></option>`)
        .join("")
    } catch (err) {
      console.error("[purchase-menu] known names failed", err)
    }
  }

  // Chama uma ação da compra e avisa a tela. true em caso de sucesso.
  async call(method, action, body = null) {
    const { cardId, inst } = this.current
    try {
      const resp = await this.authFetch(`/api/cards/${cardId}/purchases/${inst.purchase_id}/${action}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        alert((data.errors || ["Erro ao atualizar a compra"]).join(", "))
        return false
      }
      window.dispatchEvent(new CustomEvent("purchase:changed", { detail: { cardId } }))
      window.dispatchEvent(new CustomEvent("debts:changed"))
      return true
    } catch (err) {
      console.error(`[purchase-menu] ${action} failed`, err)
      alert("Erro ao atualizar a compra.")
      return false
    }
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

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
