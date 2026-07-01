<script lang="ts">
  import { Icons } from '../ui/icons'

  interface Props {
    sessionCode: string
    onEditSession: (current: string, next: string) => void
  }

  let { sessionCode, onEditSession }: Props = $props()

  const FEEDBACK_TIMEOUT_MS = 1500
  const COLLAPSE_DELAY_MS = 500

  type CapsuleState = 'collapsed' | 'expanded' | 'editing'
  let state: CapsuleState = $state('collapsed')
  let copiedTimer: ReturnType<typeof setTimeout> | null = $state(null)
  let copied = $state(false)
  let editValue = $state('')
  let inputEl: HTMLInputElement | undefined = $state(undefined)
  let containerEl: HTMLDivElement | undefined = $state(undefined)
  let shareExpanded = $state(false)
  let shareCopied = $state(false)
  let shareCopiedTimer: ReturnType<typeof setTimeout> | null = $state(null)
  let collapseTimer: ReturnType<typeof setTimeout> | null = null
  let hoveredAction: 'edit' | 'copy' | 'share' | null = $state(null)
  let tooltipStyle = $state('')
  let shareUrl = $derived(`${typeof window !== 'undefined' ? window.location.origin : ''}/s/${sessionCode}`)

  $effect(() => {
    document.addEventListener('click', handleDocumentClick)
    return () => {
      if (copiedTimer) clearTimeout(copiedTimer)
      if (shareCopiedTimer) clearTimeout(shareCopiedTimer)
      if (collapseTimer) clearTimeout(collapseTimer)
      document.removeEventListener('click', handleDocumentClick)
    }
  })

  // Collapse fully when clicking outside the capsule.
  // Uses composedPath() instead of contains() so clicks that remove their own
  // element from the DOM (e.g. the edit button switching to editing mode) are
  // still recognised as inside-capsule clicks.
  function handleDocumentClick(e: MouseEvent) {
    const path = e.composedPath()
    if (containerEl && !path.includes(containerEl as EventTarget)) {
      shareExpanded = false
      if (state === 'expanded' || state === 'editing') state = 'collapsed'
    }
  }

  function handleMouseEnter() {
    if (collapseTimer) {
      clearTimeout(collapseTimer)
      collapseTimer = null
    }
    if (state === 'collapsed') state = 'expanded'
  }

  function handleMouseLeave() {
    if (state === 'expanded' || shareExpanded) {
      collapseTimer = setTimeout(() => {
        state = 'collapsed'
        shareExpanded = false
        collapseTimer = null
      }, COLLAPSE_DELAY_MS)
    }
  }

  function handleEditClick() {
    editValue = sessionCode
    state = 'editing'
    setTimeout(() => inputEl?.focus(), 0)
  }

  function showCopiedFeedback() {
    if (copiedTimer) clearTimeout(copiedTimer)
    copied = true
    copiedTimer = setTimeout(() => { copied = false }, FEEDBACK_TIMEOUT_MS)
  }

  function handleCopy() {
    navigator.clipboard.writeText(sessionCode).then(showCopiedFeedback)
  }

  function handleShare() {
    shareExpanded = !shareExpanded
    shareCopied = false
  }

  function copyShareUrl() {
    navigator.clipboard.writeText(shareUrl).then(() => {
      if (shareCopiedTimer) clearTimeout(shareCopiedTimer)
      shareCopied = true
      shareCopiedTimer = setTimeout(() => { shareCopied = false }, FEEDBACK_TIMEOUT_MS)
    })
  }

  // submitEdit preserves the existing confirmation dialog flow in App.svelte
  function submitEdit() {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== sessionCode) {
      onEditSession(sessionCode, trimmed)
    }
    state = 'expanded'
  }

  function cancelEdit() {
    state = 'expanded'
  }

  const TOOLTIP_GAP = 6

  function handleIconHover(action: 'edit' | 'copy' | 'share', btn: HTMLElement) {
    hoveredAction = action
    // Run after Svelte renders the tooltip DOM
    setTimeout(() => {
      const tooltip = containerEl?.querySelector('[data-tooltip]') as HTMLElement
      if (!tooltip || !containerEl) return
      const capsuleRect = containerEl.getBoundingClientRect()
      const btnRect = btn.getBoundingClientRect()
      const tooltipW = tooltip.offsetWidth

      // Center tooltip on icon, relative to capsule
      const iconCenterInCapsule = btnRect.left - capsuleRect.left + btnRect.width / 2
      let left = iconCenterInCapsule - tooltipW / 2

      // Clamp: tooltip right edge must not exceed capsule right edge
      const maxLeft = capsuleRect.width - tooltipW
      left = Math.min(left, maxLeft)

      tooltipStyle = `top: calc(100% + ${TOOLTIP_GAP}px); left: ${left}px; font-size: var(--atlas-tooltip-font-size);`
    }, 0)
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && state === 'editing') {
      e.preventDefault()
      submitEdit()
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      if (shareExpanded) {
        // Escape collapses share back to hover-expanded (cursor still over capsule)
        shareExpanded = false
      } else if (state === 'editing') {
        cancelEdit()
      } else if (state === 'expanded') {
        state = 'collapsed'
      }
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={containerEl}
  class="glass-capsule flex items-center h-[var(--atlas-topbar-height)]
    rounded-[999px] transition-all duration-200 ease-in-out"
  style="overflow: visible;"
  role="group"
  aria-label="Session controls"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  onkeydown={handleKeydown}
>
  {#if state === 'editing'}
    <!-- Edit mode: input replaces content within hover-expanded width (spec §6.4) -->
    <div class="flex items-center gap-2" style="padding: 0 clamp(10px, 0.76vw, 12px);">
      <input
        bind:this={inputEl}
        bind:value={editValue}
        class="bg-transparent border-b border-dtcc-orange/50 text-dtcc-orange font-semibold outline-none"
        style="width: var(--atlas-session-input-width); font-size: var(--atlas-session-font-size); line-height: var(--atlas-session-line-height);"
      />
      <!-- Confirm: arrow-up icon (spec §6.4) -->
      <button
        class="w-[var(--atlas-session-icon-size)] h-[var(--atlas-session-icon-size)] shrink-0 cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
        style="--stroke-0: #E35A1D"
        onclick={submitEdit}
        title="Confirm edit"
      >{@html Icons.sendArrow}</button>
      <!-- Cancel -->
      <button
        class="w-[var(--atlas-session-icon-size)] h-[var(--atlas-session-icon-size)] shrink-0 cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
        onclick={cancelEdit}
        title="Cancel edit"
      >{@html Icons.close}</button>
    </div>
  {:else}
    <!-- Default + expanded + share-expanded states -->
    <div class="flex items-center w-full" style="padding: 0 clamp(10px, 0.76vw, 12px);">

      <!-- Share URL inline expansion — appears leftmost when share is active (spec §6.5) -->
      {#if shareExpanded}
        <div class="flex items-center gap-2 pr-3 mr-1 border-r border-black/10">
          <input
            readonly
            value={shareUrl}
            class="text-dtcc-dark bg-transparent outline-none select-all"
            style="width: var(--atlas-session-share-width); font-size: var(--atlas-body-text-size); text-overflow: ellipsis;"
            onclick={(e) => (e.currentTarget as HTMLInputElement).select()}
          />
          <button
            class="shrink-0 font-semibold cursor-pointer whitespace-nowrap transition-colors
              {shareCopied ? 'text-green-600' : 'text-dtcc-orange hover:text-dtcc-orange-dark'}"
            style="font-size: var(--atlas-caption-text-size);"
            onclick={copyShareUrl}
          >{shareCopied ? 'Copied!' : 'Copy'}</button>
        </div>
      {/if}

      <!-- User icon + session code — always visible, anchors the left side (spec §6.1) -->
      <div class="flex items-center gap-1.5 shrink-0">
        <span class="shrink-0 opacity-70" style="width: calc(var(--atlas-topbar-title-line-height) * 0.8); height: calc(var(--atlas-topbar-title-line-height) * 0.8);">
          {@html Icons.user}
        </span>
        <span
          class="text-dtcc-orange font-semibold whitespace-nowrap select-none"
          style="font-size: var(--atlas-session-font-size); line-height: var(--atlas-session-line-height);"
        >
          {copied ? 'Copied!' : sessionCode}
        </span>
      </div>

      <!-- Action icons — always in DOM, animate in/out via max-width + opacity -->
      <div
        class="flex items-center gap-2 justify-center overflow-hidden"
        style="
          flex: {(state === 'expanded' || shareExpanded) ? '1' : '0'};
          max-width: {(state === 'expanded' || shareExpanded) ? '200px' : '0px'};
          opacity: {(state === 'expanded' || shareExpanded) ? '1' : '0'};
          margin-left: {(state === 'expanded' || shareExpanded) ? '0.5rem' : '0'};
          transition: max-width 200ms ease-in-out, opacity 200ms ease-in-out, margin-left 200ms ease-in-out, flex 200ms ease-in-out;
          pointer-events: {(state === 'expanded' || shareExpanded) ? 'auto' : 'none'};
        "
      >
          <button
            class="shrink-0 cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
            style="width: var(--atlas-session-icon-size-lg); height: var(--atlas-session-icon-size-lg);"
            onclick={handleEditClick}
            onmouseenter={(e) => handleIconHover('edit', e.currentTarget as HTMLElement)}
            onmouseleave={() => hoveredAction = null}
            aria-label="Edit session code"
          >{@html Icons.edit}</button>
          <button
            class="w-[var(--atlas-session-icon-size)] h-[var(--atlas-session-icon-size)] shrink-0 cursor-pointer
              transition-opacity {copied ? 'opacity-100' : 'opacity-60 hover:opacity-100'}"
            style={copied ? '--stroke-0: #E35A1D' : ''}
            onclick={handleCopy}
            onmouseenter={(e) => handleIconHover('copy', e.currentTarget as HTMLElement)}
            onmouseleave={() => hoveredAction = null}
            aria-label="Copy session code"
          >{@html Icons.copy}</button>
          <button
            class="w-[var(--atlas-session-icon-size)] h-[var(--atlas-session-icon-size)] shrink-0 cursor-pointer
              transition-opacity {shareExpanded ? 'opacity-100' : 'opacity-60 hover:opacity-100'}"
            style={shareExpanded ? '--stroke-0: #E35A1D' : ''}
            onclick={handleShare}
            onmouseenter={(e) => handleIconHover('share', e.currentTarget as HTMLElement)}
            onmouseleave={() => hoveredAction = null}
            aria-label="Share session link"
          >{@html Icons.share}</button>
      </div>

    </div>
  {/if}

  <!-- Tooltip: below capsule, centered on hovered icon, clamped to capsule right edge -->
  {#if hoveredAction !== null}
    <div
      data-tooltip
      class="pointer-events-none absolute z-50
        px-2.5 py-1 rounded-md bg-dtcc-navy text-white font-medium whitespace-nowrap shadow-lg
        max-sm:hidden"
      style={tooltipStyle}
    >
      {hoveredAction === 'edit' ? 'Edit session code' : hoveredAction === 'copy' ? 'Copy session code' : 'Share session link'}
    </div>
  {/if}
</div>

<style>
  .glass-capsule {
    position: relative;
    background: rgba(255, 255, 255, var(--glass-bg-opacity, 0.55));
    backdrop-filter: blur(var(--glass-blur, 4px)) saturate(var(--glass-saturate, 1.1));
    -webkit-backdrop-filter: blur(var(--glass-blur, 4px)) saturate(var(--glass-saturate, 1.1));
    border: 1px solid rgba(255, 255, 255, var(--glass-border-opacity, 0.5));
    box-shadow:
      var(--glass-shadow-x, 0px) var(--glass-shadow-y, 3px) var(--glass-shadow-blur, 7px) rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      inset 0 -1px 0 rgba(255, 255, 255, 0.1);
    overflow: hidden;
  }

  .glass-capsule::before {
    content: '';
    position: absolute;
    inset: 0;
    padding: 2px;
    border-radius: inherit;
    background: radial-gradient(
      ellipse at 30px 0px,
      rgba(255, 255, 255, var(--glass-edge-opacity, 0.25)) 0%,
      rgba(255, 255, 255, calc(var(--glass-edge-opacity, 0.25) * 0.4)) 40%,
      transparent 80%
    );
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
    z-index: 50;
  }

  button :global(svg),
  span :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
