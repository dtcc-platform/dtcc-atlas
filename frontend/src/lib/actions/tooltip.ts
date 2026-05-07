export function tooltip(node: HTMLElement, text: string) {
  let div: HTMLDivElement | null = null
  let showTimer: ReturnType<typeof setTimeout> | null = null

  function show() {
    showTimer = setTimeout(() => {
      const rect = node.getBoundingClientRect()
      div = document.createElement('div')
      div.textContent = text
      div.style.cssText = `
        position: fixed;
        left: ${rect.left + rect.width / 2}px;
        top: ${rect.bottom + 6}px;
        transform: translateX(-50%);
        padding: 3px 10px;
        border-radius: 6px;
        background: var(--color-dtcc-navy, #172541);
        color: white;
        font-size: var(--atlas-tooltip-font-size, 11px);
        font-weight: 500;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        pointer-events: none;
        z-index: 9999;
      `
      document.body.appendChild(div)
    }, 300)
  }

  function hide() {
    if (showTimer) { clearTimeout(showTimer); showTimer = null }
    div?.remove()
    div = null
  }

  node.addEventListener('mouseenter', show)
  node.addEventListener('mouseleave', hide)

  return {
    update(newText: string) {
      text = newText
      if (div) div.textContent = newText
    },
    destroy() {
      node.removeEventListener('mouseenter', show)
      node.removeEventListener('mouseleave', hide)
      hide()
    },
  }
}
