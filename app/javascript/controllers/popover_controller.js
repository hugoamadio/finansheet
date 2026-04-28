import { Controller } from "@hotwired/stimulus"

// Popover dedicado e reutilizável.
//
// Anexe a qualquer elemento que precise de uma explicação contextual no
// hover/focus, ex:
//   <button disabled
//           data-controller="popover"
//           data-popover-text-value="Não pode editar porque ...">…</button>
//
// O elemento popover é criado dinamicamente e posicionado com base no
// bounding rect do disparador. `pointer-events: none` no popover garante
// que ele não rouba o hover. Em botões disabled o mouseenter ainda dispara
// desde que o CSS NÃO defina `pointer-events: none` no botão (cards.css
// preserva isso de propósito).
export default class extends Controller {
  static values = {
    text:      String,
    placement: { type: String, default: "top" }, // "top" ou "bottom"
    offset:    { type: Number, default: 8 },
  }

  connect() {
    this.onEnter = () => this.show()
    this.onLeave = () => this.hide()
    this.element.addEventListener("mouseenter", this.onEnter)
    this.element.addEventListener("mouseleave", this.onLeave)
    this.element.addEventListener("focus",      this.onEnter)
    this.element.addEventListener("blur",       this.onLeave)
  }

  disconnect() {
    this.element.removeEventListener("mouseenter", this.onEnter)
    this.element.removeEventListener("mouseleave", this.onLeave)
    this.element.removeEventListener("focus",      this.onEnter)
    this.element.removeEventListener("blur",       this.onLeave)
    this.hide()
  }

  show() {
    if (this.popoverEl || !this.textValue) return

    const el = document.createElement("div")
    el.className = "popover"
    el.textContent = this.textValue
    document.body.appendChild(el)
    this.popoverEl = el

    // Posicionar APÓS attach pra ter dimensões reais
    const rect = this.element.getBoundingClientRect()
    const popRect = el.getBoundingClientRect()
    const scrollX = window.scrollX
    const scrollY = window.scrollY

    const centerX = rect.left + rect.width / 2 - popRect.width / 2 + scrollX
    const top = this.placementValue === "bottom"
      ? rect.bottom + this.offsetValue + scrollY
      : rect.top - popRect.height - this.offsetValue + scrollY

    // Clamp horizontal pra não sair da viewport
    const minX = 8 + scrollX
    const maxX = scrollX + document.documentElement.clientWidth - popRect.width - 8
    const left = Math.max(minX, Math.min(centerX, maxX))

    el.style.left = `${left}px`
    el.style.top  = `${top}px`
    el.classList.add("popover--visible")
  }

  hide() {
    if (!this.popoverEl) return
    this.popoverEl.remove()
    this.popoverEl = null
  }
}
