import { Controller } from "@hotwired/stimulus"

// Tour de onboarding custom (vanilla, sem libs).
//
// Filosofia:
// - 7 passos focados em CONCEITOS (fecha dia, virar ciclo, "já paguei
//   parcelas") — não em campos óbvios. Tours longos perdem o usuário.
// - Highlight via overlay SVG com cutout (mask) — não toca em
//   position/z-index do alvo, então não quebra layout.
// - Quando o alvo está dentro de <dialog open>, o popover é montado
//   DENTRO do dialog (compartilha o top layer nativo). Quando o alvo
//   está fora de modal, popover vai no body com position fixed.
// - Sem bloquear pointer-events globalmente. Steps ativos avançam por
//   evento custom (card:created, purchase:created, fixed-expense:created
//   ou abertura/fechamento de dialog). Steps passivos têm botão "Próximo".
// - Persistência cross-device via PATCH /me/tour; cache em sessionStorage
//   evita reabrir após turbo nav dentro da mesma sessão.
//
// O controller é instanciado pelo data-controller="tour" do <body>.
export default class extends Controller {
  static HOME_PATH = "/dashboard"

  connect() {
    this.driving = false
    this.starting = false
    this.currentIndex = 0
    this.steps = []
    this.cleanups = []
    this.highlightedEls = []
    this.skipping = false
    this.repositionRaf = null
    this.lastUser = null

    this.onUser = this.onUser.bind(this)
    this.onResize = this.onResize.bind(this)
    this.onScroll = this.onScroll.bind(this)
    this.onKey = this.onKey.bind(this)

    window.addEventListener("auth:user", this.onUser)
  }

  disconnect() {
    window.removeEventListener("auth:user", this.onUser)
    this.teardown()
  }

  // ─── Disparo automático ───────────────────────────────────────────

  onUser(event) {
    const user = event.detail
    if (!user) return
    this.lastUser = user

    // Step 1 (salário) avança quando o user salva — re-dispatch do
    // salary_setup_controller.
    const salaryConfigured = user.salary_day || user.salary_on_last_day
    if (this.driving && this.currentStep?.key === "salary" && salaryConfigured) {
      this.next()
      return
    }

    if (this.driving || this.starting) return
    if (user.tour_completed_at || user.tour_skipped_at) {
      console.info("[tour] não inicia — tour já completed/skipped no user.", { tour_completed_at: user.tour_completed_at, tour_skipped_at: user.tour_skipped_at })
      return
    }
    if (window.location.pathname !== this.constructor.HOME_PATH) return

    this.starting = true
    // Pequeno delay pro grid e modais terminarem de bootar.
    setTimeout(() => {
      this.starting = false
      this.start()
    }, 400)
  }

  // ─── Steps ───────────────────────────────────────────────────────

  buildSteps() {
    return [
      {
        key: "salary",
        target: '.modal--salary-setup [data-salary-setup-target="form"]',
        focus:  '.modal--salary-setup [data-salary-setup-target="dayInput"]',
        // O <form> é também .modal__body com overflow-y:auto, que clipa
        // box-shadow externa. Sem highlight visual: o backdrop nativo do
        // dialog já isola o modal e o popover é claro o suficiente.
        noHighlight: true,
        title: "Vamos começar pelo seu salário",
        body: "Tudo no FinanSheet gira em torno desse dia — fechamento de cartão, somas do mês e virada de ciclo. Ele é o <strong>marco zero</strong>.",
        // Avança via auth:user re-dispatch (ver onUser).
        passive: false,
      },
      {
        key: "newCard",
        target: ".cards-page__header .action-btn--primary",
        title: "Agora um cartão",
        body: "Pra começar, clique aqui.",
        advanceOnDialogOpen: '[data-cards-target="formModal"]',
        passive: false,
      },
      {
        key: "bestDay",
        // Highlight no <label> inteiro (texto "Fecha dia (1-31)" + input) —
        // assim o popover, mesmo cobrindo a área do input, não esconde o label.
        target: '[data-cards-target="formModal"] label.form-field:has([data-cards-target="fieldBestDay"])',
        focus:  '[data-cards-target="formModal"] [data-cards-target="fieldBestDay"]',
        // placement right: popover sai do dialog pela direita, sem cobrir o
        // submit nem o label.
        placement: "right",
        title: "O campo que faz toda a diferença",
        body: "<strong>Fecha dia</strong> decide em qual fatura cada compra cai: <em>até</em> o dia, vai pra fatura do mês; <em>depois</em>, escapa pro mês seguinte.",
        advanceOn: "card:created",
        passive: false,
      },
      {
        key: "newPurchase",
        target: ".cards-grid .card-item:not(.card-item--add):last-child .card-item__action--primary",
        title: "Agora uma compra",
        body: "Clique aqui pra lançar uma compra nesse cartão.",
        advanceOnDialogOpen: '[data-cards-target="purchaseModal"]',
        passive: false,
      },
      {
        key: "hasPaid",
        // Highlight no label.form-field--inline (envolve checkbox + texto + ⓘ).
        // O JS resolve via :has() — selector nativo do CSS Selectors L4.
        target: '[data-cards-target="purchaseModal"] label.form-field--inline:has([data-cards-target="purchaseFieldHasPaid"])',
        focus:  '[data-cards-target="purchaseModal"] [data-cards-target="purchaseFieldHasPaid"]',
        // placement right: popover sai do dialog pra direita, sem cobrir
        // os campos restantes do form nem o botão Lançar.
        placement: "right",
        title: "Funciona pra compra antiga também",
        body: "Tem uma compra parcelada que começou meses atrás? Marque essa opção e o sistema cadastra só as parcelas que faltam. O <strong>ⓘ</strong> ao lado tem o detalhe.",
        advanceOn: "purchase:created",
        passive: false,
      },
      {
        key: "sidebar",
        target: [".sidebar-fixed", ".sidebar-cycle"],
        // anchor no sidebar-cycle (que tem altura real). Placement right
        // posiciona o popover à direita da sidebar, sem cobrir cartões.
        anchor: ".sidebar-cycle",
        placement: "right",
        title: "Sua visão do mês",
        body: "Tudo que entra (A receber) e sai (cartões + contas fixas) vira um saldo projetado aqui. Sem definir o <em>A receber</em>, o saldo fica zero.",
        onEnter: () => this.openMobileSidebarIfNeeded(),
        passive: true,
      },
      {
        key: "closeCycle",
        target: '[data-cards-target="closeCycleButton"]',
        title: "No fim do mês",
        body: "Com tudo pago, clique em Virar Ciclo. O mês fica <em>imutável</em> no histórico e o próximo abre limpo.",
        // Fecha o drawer mobile aberto no passo 6 (senão cobre o
        // botão Virar Ciclo no header).
        onEnter: () => this.closeMobileSidebarIfOpen(),
        passive: true,
        last: true,
      },
    ]
  }

  // ─── Lifecycle ───────────────────────────────────────────────────

  start() {
    if (this.driving) return
    this.driving = true
    this.steps = this.buildSteps()

    // Pula o step "salary" se o user já configurou — evita tour preso
    // esperando um dialog que nunca vai abrir.
    const user = this.lastUser || window.currentUser
    const salaryConfigured = user && (user.salary_day || user.salary_on_last_day)
    if (salaryConfigured) {
      this.steps = this.steps.filter((s) => s.key !== "salary")
    }

    console.info("[tour] iniciando — passos:", this.steps.map((s) => s.key))
    this.currentIndex = 0
    this.mountChrome()
    this.bindGlobalListeners()
    this.enterStep()
  }

  end() {
    if (!this.driving) return
    this.driving = false
    this.teardown()
  }

  teardown() {
    this.clearHighlights()
    this.unbindStepListeners()
    this.unbindGlobalListeners()
    if (this.repositionRaf) {
      cancelAnimationFrame(this.repositionRaf)
      this.repositionRaf = null
    }
    document.body.classList.remove("tour-bottom-sheet")
    this.unmountChrome()
  }

  clearHighlights() {
    if (this.highlightedEls?.length) {
      this.highlightedEls.forEach((el) => el.classList.remove("tour-target--highlight"))
    }
    this.highlightedEls = []
  }

  // ─── DOM chrome (overlay + popover) ──────────────────────────────

  mountChrome() {
    // Overlay SVG full-viewport com cutout no(s) alvo(s). Renderizado no
    // body — scroll independe do popover (que é reposicionado a cada frame).
    const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    overlay.classList.add("tour-overlay")
    overlay.setAttribute("aria-hidden", "true")
    overlay.innerHTML = `
      <defs>
        <mask id="tour-mask" maskUnits="userSpaceOnUse">
          <rect class="tour-mask__bg" x="0" y="0" width="100%" height="100%" fill="white"/>
        </mask>
      </defs>
      <rect class="tour-overlay__fill" x="0" y="0" width="100%" height="100%" mask="url(#tour-mask)"/>
    `
    document.body.appendChild(overlay)
    this.overlayEl = overlay
    this.maskEl = overlay.querySelector("mask")

    // Popover é criado mas não anexado ainda — anexamos no enterStep
    // (no body OU dentro de dialog dependendo do alvo).
    const pop = document.createElement("div")
    pop.className = "tour-popover"
    pop.setAttribute("role", "dialog")
    pop.setAttribute("aria-live", "polite")
    pop.innerHTML = `
      <div class="tour-popover__progress"></div>
      <h3 class="tour-popover__title"></h3>
      <div class="tour-popover__body"></div>
      <div class="tour-popover__footer">
        <button type="button" class="tour-popover__skip">Pular onboarding</button>
        <div class="tour-popover__nav">
          <button type="button" class="tour-popover__prev">Voltar</button>
          <button type="button" class="tour-popover__next">Próximo</button>
        </div>
      </div>
      <div class="tour-popover__arrow" aria-hidden="true"></div>
    `
    this.popoverEl = pop
    this.popoverEl.querySelector(".tour-popover__skip").addEventListener("click", () => this.skip())
    this.popoverEl.querySelector(".tour-popover__prev").addEventListener("click", () => this.prev())
    this.popoverEl.querySelector(".tour-popover__next").addEventListener("click", () => this.next())
  }

  unmountChrome() {
    this.overlayEl?.remove()
    this.popoverEl?.remove()
    this.overlayEl = null
    this.popoverEl = null
    this.maskEl = null
  }

  // ─── Step transitions ────────────────────────────────────────────

  get currentStep() {
    return this.steps[this.currentIndex] || null
  }

  enterStep() {
    const step = this.currentStep
    if (!step) return this.complete()

    this.unbindStepListeners()

    // Resolve elementos-alvo. Aceita string OU array de strings.
    const targets = this.resolveTargets(step.target)
    if (targets.length === 0) {
      // Alvo ainda não está no DOM — espera com pequeno polling, depois
      // pula o step se não aparecer (defensivo, não deveria acontecer
      // com a sequência atual).
      this.waitForElement(step.target, 4000).then(
        () => this.enterStep(),
        () => { this.currentIndex++; this.enterStep() },
      )
      return
    }

    // Anchor pra posicionar popover (padrão: primeiro alvo)
    const anchorEl = step.anchor ? document.querySelector(step.anchor) : targets[0]

    // Se o alvo está dentro de um <dialog> que ainda não abriu, esperar.
    // Sem isso, o popover seria montado no body e o ::backdrop nativo do
    // dialog (top layer) ficaria por cima quando o dialog abrir → popover
    // some "atrás do modal".
    const dialogAncestor = anchorEl.closest("dialog")
    if (dialogAncestor && !dialogAncestor.hasAttribute("open")) {
      // Esconde popover e overlay até o dialog abrir
      if (this.popoverEl) this.popoverEl.style.visibility = "hidden"
      if (this.overlayEl) this.overlayEl.style.visibility = "hidden"
      const obs = new MutationObserver(() => {
        if (dialogAncestor.hasAttribute("open")) {
          obs.disconnect()
          this.enterStep()
        }
      })
      obs.observe(dialogAncestor, { attributes: true, attributeFilter: ["open"] })
      this.cleanups.push(() => obs.disconnect())
      return
    }

    if (this.popoverEl) this.popoverEl.style.visibility = ""
    if (this.overlayEl) this.overlayEl.style.visibility = ""

    // Decide onde montar o popover: dentro do <dialog open> ancestral
    // (top layer) ou no body.
    const dialog = dialogAncestor // já validado como aberto acima
    const mountPoint = dialog || document.body
    if (this.popoverEl.parentElement !== mountPoint) mountPoint.appendChild(this.popoverEl)
    this.popoverEl.dataset.inDialog = dialog ? "1" : "0"

    // Em mobile (<= 600px), quando o target está em dialog, ativamos
    // o modo "bottom sheet" — popover fixa no rodapé da viewport, full
    // width. Evita overlap com o dialog em viewports apertadas.
    const useBottomSheet = window.innerWidth <= 600 && !!dialog
    document.body.classList.toggle("tour-bottom-sheet", useBottomSheet)
    this.popoverEl.dataset.bottomSheet = useBottomSheet ? "1" : "0"

    // Highlight visual: dentro de dialog, o ::backdrop nativo cobre o
    // overlay SVG (que vive no body) — então usamos box-shadow direto
    // no target. Fora de dialog, overlay SVG com cutout funciona.
    // Steps com noHighlight=true pulam o realce visual (útil quando o
    // alvo tem overflow:auto, que clipa box-shadow externa).
    this.clearHighlights()
    if (dialog) {
      if (this.overlayEl) this.overlayEl.style.display = "none"
      if (!step.noHighlight) {
        targets.forEach((el) => el.classList.add("tour-target--highlight"))
        this.highlightedEls = targets
      }
    } else {
      if (this.overlayEl) this.overlayEl.style.display = ""
    }

    // Conteúdo
    this.popoverEl.querySelector(".tour-popover__progress").textContent =
      `Passo ${this.currentIndex + 1} de ${this.steps.length}`
    this.popoverEl.querySelector(".tour-popover__title").textContent = step.title
    this.popoverEl.querySelector(".tour-popover__body").innerHTML = step.body

    // Visibilidade do "Voltar" e "Próximo"
    const prevBtn = this.popoverEl.querySelector(".tour-popover__prev")
    const nextBtn = this.popoverEl.querySelector(".tour-popover__next")
    prevBtn.hidden = this.currentIndex === 0
    nextBtn.hidden = !step.passive
    nextBtn.textContent = step.last ? "Concluir" : "Próximo"

    // onEnter callback
    step.onEnter?.()

    // Foco programático (sem ferir o foco do dialog se houver)
    if (step.focus) {
      const focusEl = document.querySelector(step.focus)
      if (focusEl) requestAnimationFrame(() => focusEl.focus({ preventScroll: false }))
    }

    // Listeners de avanço
    if (step.advanceOn) {
      const fn = () => this.next()
      window.addEventListener(step.advanceOn, fn, { once: true })
      this.cleanups.push(() => window.removeEventListener(step.advanceOn, fn))
    }
    if (step.advanceOnDialogOpen) {
      this.observeDialog(step.advanceOnDialogOpen, (open) => { if (open) this.next() })
    }
    if (step.advanceOnDialogClose) {
      this.observeDialog(step.advanceOnDialogClose, (open) => { if (!open) this.next() })
    }

    // Pinta cutouts (só fora de dialog) e posiciona o popover.
    // No modo bottom sheet, o popover é posicionado por CSS (fixed bottom);
    // não chamamos positionPopover.
    if (!dialog) this.paintCutouts(targets, step.targetExpand ?? 8)
    if (!useBottomSheet) this.positionPopover(anchorEl)
    this.scheduleReposition()
  }

  next() {
    if (!this.driving) return
    if (this.currentStep?.last) return this.complete()
    this.currentIndex++
    this.enterStep()
  }

  prev() {
    if (!this.driving) return
    if (this.currentIndex === 0) return
    this.currentIndex--
    this.enterStep()
  }

  skip() {
    if (!this.driving) return
    this.skipping = true
    this.saveStatus("skipped")
    this.end()
  }

  complete() {
    if (this.skipping) return
    this.saveStatus("completed")
    this.end()
  }

  // ─── Layout (overlay cutout + popover positioning) ───────────────

  paintCutouts(targets, padding = 8) {
    if (!this.maskEl) return

    // Reseta cutouts anteriores
    this.maskEl.querySelectorAll(".tour-mask__hole").forEach((n) => n.remove())

    targets.forEach((el) => {
      const r = el.getBoundingClientRect()
      const hole = document.createElementNS("http://www.w3.org/2000/svg", "rect")
      hole.classList.add("tour-mask__hole")
      hole.setAttribute("x",      Math.max(0, r.left - padding))
      hole.setAttribute("y",      Math.max(0, r.top - padding))
      hole.setAttribute("width",  Math.max(0, r.width + padding * 2))
      hole.setAttribute("height", Math.max(0, r.height + padding * 2))
      hole.setAttribute("rx", "10")
      hole.setAttribute("ry", "10")
      hole.setAttribute("fill", "black")
      this.maskEl.appendChild(hole)
    })
  }

  positionPopover(anchorEl) {
    if (!this.popoverEl || !anchorEl) return

    // Bounding boxes em viewport coords. Como o popover é position: fixed,
    // todas as coords são viewport (não importa se está em dialog ou body).
    const target = anchorEl.getBoundingClientRect()
    const pop = this.popoverEl
    pop.style.visibility = "hidden"
    pop.style.left = "0px"
    pop.style.top = "0px"
    const popRect = pop.getBoundingClientRect()
    const popW = popRect.width
    const popH = popRect.height
    pop.style.visibility = ""

    const margin = 16
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight

    // Quando o target está dentro de um <dialog open>, o popover deve
    // ficar FORA dos bounds visíveis do dialog (senão sobrepõe outros
    // elementos do dialog). Usamos o dialog rect como referência pra
    // decidir placement, mas as coords e a arrow ainda usam o target.
    const dialogEl = anchorEl.closest("dialog[open]")
    const placementRef = dialogEl ? dialogEl.getBoundingClientRect() : target

    // Decide placement: respeita override do step se definido, senão
    // tenta bottom > top > right > left.
    const spaceBelow = vh - placementRef.bottom
    const spaceAbove = placementRef.top
    const spaceRight = vw - placementRef.right
    const spaceLeft  = placementRef.left

    // Fits-check pra cada placement
    const fits = {
      bottom: spaceBelow >= popH + margin,
      top:    spaceAbove >= popH + margin,
      right:  spaceRight >= popW + margin,
      left:   spaceLeft  >= popW + margin,
    }
    const stepPlacement = this.currentStep?.placement
    let placement
    if (stepPlacement && fits[stepPlacement]) {
      // placement explícito do step E cabe — usa
      placement = stepPlacement
    } else if (fits.bottom) {
      placement = "bottom"
    } else if (fits.top) {
      placement = "top"
    } else if (fits.right) {
      placement = "right"
    } else if (fits.left) {
      placement = "left"
    } else {
      placement = "bottom" // último recurso (vai ficar clampado)
    }

    // Pra coords do popover, usamos placementRef (que é o dialog quando
    // target está dentro dele) — assim o popover encosta na borda do
    // dialog, não na borda do target interno. Pra eixo perpendicular
    // ao placement (centro do popover), usamos o target — assim a seta
    // aponta pro elemento real.
    let top, left
    switch (placement) {
      case "bottom":
        top = placementRef.bottom + margin
        left = target.left + target.width / 2 - popW / 2
        break
      case "top":
        top = placementRef.top - popH - margin
        left = target.left + target.width / 2 - popW / 2
        break
      case "right":
        left = placementRef.right + margin
        top = target.top + target.height / 2 - popH / 2
        break
      case "left":
        left = placementRef.left - popW - margin
        top = target.top + target.height / 2 - popH / 2
        break
    }

    // Clamp dentro da viewport
    left = Math.max(margin, Math.min(left, vw - popW - margin))
    top = Math.max(margin, Math.min(top, vh - popH - margin))

    pop.style.left = `${Math.round(left)}px`
    pop.style.top  = `${Math.round(top)}px`
    pop.dataset.placement = placement

    // Posiciona arrow apontando pro centro do target. Quando o popover é
    // clampado pelo edge da viewport, o centro do popover não coincide
    // com o centro do target — a arrow precisa ser deslocada pra apontar
    // certo. Calculamos offset relativo ao popover.
    const arrow = pop.querySelector(".tour-popover__arrow")
    arrow.dataset.placement = placement
    if (placement === "top" || placement === "bottom") {
      const targetCenterX = target.left + target.width / 2
      const arrowOffset = Math.max(14, Math.min(targetCenterX - left, popW - 14))
      arrow.style.left = `${Math.round(arrowOffset)}px`
      arrow.style.right = ""
      arrow.style.top = ""
      arrow.style.bottom = ""
      arrow.style.marginLeft = "-6px"
    } else {
      const targetCenterY = target.top + target.height / 2
      const arrowOffset = Math.max(14, Math.min(targetCenterY - top, popH - 14))
      arrow.style.top = `${Math.round(arrowOffset)}px`
      arrow.style.bottom = ""
      arrow.style.left = ""
      arrow.style.right = ""
      arrow.style.marginTop = "-6px"
    }
  }

  scheduleReposition() {
    if (this.repositionRaf) cancelAnimationFrame(this.repositionRaf)
    const tick = () => {
      const step = this.currentStep
      if (!step || !this.driving) return
      const targets = this.resolveTargets(step.target)
      const anchor = step.anchor ? document.querySelector(step.anchor) : targets[0]
      if (targets.length && anchor) {
        const dialog = anchor.closest("dialog[open]")
        if (!dialog) this.paintCutouts(targets, step.targetExpand ?? 8)
        // Em modo bottom sheet (mobile + dialog), CSS controla posição —
        // não recalculamos.
        const isBottomSheet = this.popoverEl?.dataset.bottomSheet === "1"
        if (!isBottomSheet) this.positionPopover(anchor)
      }
      this.repositionRaf = requestAnimationFrame(tick)
    }
    this.repositionRaf = requestAnimationFrame(tick)
  }

  // ─── Listeners ───────────────────────────────────────────────────

  bindGlobalListeners() {
    window.addEventListener("resize", this.onResize)
    window.addEventListener("scroll", this.onScroll, true)
    document.addEventListener("keydown", this.onKey)
  }

  unbindGlobalListeners() {
    window.removeEventListener("resize", this.onResize)
    window.removeEventListener("scroll", this.onScroll, true)
    document.removeEventListener("keydown", this.onKey)
  }

  unbindStepListeners() {
    this.cleanups.forEach((fn) => { try { fn() } catch (e) {} })
    this.cleanups = []
  }

  observeDialog(selector, callback) {
    const dialog = document.querySelector(selector)
    if (!dialog) return
    const obs = new MutationObserver(() => callback(dialog.hasAttribute("open")))
    obs.observe(dialog, { attributes: true, attributeFilter: ["open"] })
    this.cleanups.push(() => obs.disconnect())
  }

  onResize() { /* reposition é via rAF */ }
  onScroll() { /* idem */ }

  onKey(e) {
    if (!this.driving) return
    if (e.key === "Escape") { e.preventDefault(); this.skip() }
    else if (e.key === "ArrowRight" && this.currentStep?.passive) { e.preventDefault(); this.next() }
    else if (e.key === "ArrowLeft" && this.currentIndex > 0) { e.preventDefault(); this.prev() }
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  resolveTargets(spec) {
    const list = Array.isArray(spec) ? spec : [spec]
    return list.map((sel) => document.querySelector(sel)).filter(Boolean)
  }

  waitForElement(spec, timeout = 4000) {
    return new Promise((resolve, reject) => {
      const found = this.resolveTargets(spec)
      if (found.length) return resolve(found)
      const t = setTimeout(() => { obs.disconnect(); reject() }, timeout)
      const obs = new MutationObserver(() => {
        const f = this.resolveTargets(spec)
        if (f.length) { clearTimeout(t); obs.disconnect(); resolve(f) }
      })
      obs.observe(document.body, { childList: true, subtree: true, attributes: true })
    })
  }

  openMobileSidebarIfNeeded() {
    if (window.innerWidth >= 768) return
    document.querySelector(".sidebar")?.classList.add("is-open")
  }

  closeMobileSidebarIfOpen() {
    if (window.innerWidth >= 768) return
    document.querySelector(".sidebar")?.classList.remove("is-open")
  }

  // ─── Persistência ────────────────────────────────────────────────

  async saveStatus(status) {
    try {
      const resp = await this.authFetch("/me/tour", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data.success) {
        window.currentUser = data.user
        try { localStorage.setItem("current_user", JSON.stringify(data.user)) } catch {}
        window.dispatchEvent(new CustomEvent("auth:user", { detail: data.user }))
      }
    } catch (err) {
      console.warn("[tour] saveStatus failed", err)
    }
  }

  authFetch(url, options = {}) {
    const token = localStorage.getItem("auth_token")
    return fetch(url, {
      ...options,
      headers: {
        "Accept": "application/json",
        ...(options.headers ?? {}),
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      },
    })
  }
}
