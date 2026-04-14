<script lang="ts">
  import { Icons } from '../ui/icons'

  interface Props {
    sessionCode: string
    onEditSession: (current: string, next: string) => void
  }

  let { sessionCode, onEditSession }: Props = $props()

  type CapsuleState = 'collapsed' | 'expanded' | 'editing'
  let state: CapsuleState = $state('collapsed')
  let collapseTimer: ReturnType<typeof setTimeout> | null = $state(null)
  let copiedTimer: ReturnType<typeof setTimeout> | null = $state(null)
  let copied = $state(false)
  let editValue = $state('')
  let inputEl: HTMLInputElement | undefined = $state(undefined)
  let containerEl: HTMLDivElement | undefined = $state(undefined)
  let sharePopupVisible = $state(false)
  let shareCopied = $state(false)
  let shareCopiedTimer: ReturnType<typeof setTimeout> | null = $state(null)
  let shareUrl = $derived(`${typeof window !== 'undefined' ? window.location.origin : ''}/s/${sessionCode}`)

  // Clean up timers on destroy and remove document click listener
  $effect(() => {
    document.addEventListener('click', handleDocumentClick)
    return () => {
      if (collapseTimer) clearTimeout(collapseTimer)
      if (copiedTimer) clearTimeout(copiedTimer)
      if (shareCopiedTimer) clearTimeout(shareCopiedTimer)
      document.removeEventListener('click', handleDocumentClick)
    }
  })

  function startCollapseTimer() {
    clearCollapseTimer()
    collapseTimer = setTimeout(() => {
      if (state === 'expanded') {
        state = 'collapsed'
        sharePopupVisible = false
      }
    }, 5000)
  }

  function clearCollapseTimer() {
    if (collapseTimer) {
      clearTimeout(collapseTimer)
      collapseTimer = null
    }
  }

  function handleMouseEnter() {
    clearCollapseTimer()
    if (state === 'collapsed') state = 'expanded'
  }

  function handleMouseLeave() {
    if (state === 'expanded') startCollapseTimer()
  }

  // Auto-collapse when user clicks outside the capsule (e.g. on the map)
  function handleDocumentClick(e: MouseEvent) {
    if (containerEl && !containerEl.contains(e.target as Node)) {
      if (sharePopupVisible) sharePopupVisible = false
      if (state === 'expanded') {
        state = 'collapsed'
        clearCollapseTimer()
      }
    }
  }

  function handlePenClick() {
    if (state === 'editing') {
      submitEdit()
    } else {
      editValue = sessionCode
      state = 'editing'
      setTimeout(() => inputEl?.focus(), 0)
    }
  }

  function showCopiedFeedback() {
    if (copiedTimer) clearTimeout(copiedTimer)
    copied = true
    copiedTimer = setTimeout(() => copied = false, 1500)
  }

  function handleCopy() {
    navigator.clipboard.writeText(sessionCode).then(showCopiedFeedback)
  }

  function handleShare() {
    sharePopupVisible = !sharePopupVisible
    shareCopied = false
  }

  function copyShareUrl() {
    navigator.clipboard.writeText(shareUrl).then(() => {
      if (shareCopiedTimer) clearTimeout(shareCopiedTimer)
      shareCopied = true
      shareCopiedTimer = setTimeout(() => shareCopied = false, 1500)
    })
  }

  function submitEdit() {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== sessionCode) {
      onEditSession(sessionCode, trimmed)
    }
    state = 'expanded'
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      submitEdit()
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      state = 'expanded'
    }
  }

  function cancelEdit() {
    state = 'expanded'
  }
</script>

<div
  bind:this={containerEl}
  class="relative flex items-center h-[var(--atlas-topbar-inner-height)] rounded-[999px] transition-all duration-300 ease-in-out
    bg-white/50 border border-white/20"
  role="group"
  aria-label="Session controls"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
>
  {#if state === 'editing'}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- onkeydown on container so Escape is caught even when focus is on buttons, not just the input -->
    <div class="flex items-center gap-2" style="padding: clamp(6px, 0.89vh, 8px) clamp(10px, 0.76vw, 12px) clamp(6px, 0.89vh, 8px) clamp(12px, 1.04vw, 16px);" onkeydown={handleKeydown}>
      <input
        bind:this={inputEl}
        bind:value={editValue}
        class="bg-transparent border-b border-dtcc-orange/50 text-dtcc-orange font-semibold outline-none"
        style="width: var(--atlas-session-input-width); font-size: var(--atlas-session-font-size); line-height: var(--atlas-session-line-height);"
      />
      <button
        class="w-[var(--atlas-panel-action-icon-size)] h-[var(--atlas-panel-action-icon-size)] shrink-0 cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
        style="--stroke-0: #E35A1D"
        onclick={handlePenClick}
        title="Confirm edit"
      >{@html Icons.pen}</button>
      <button
        class="w-[var(--atlas-panel-action-icon-size)] h-[var(--atlas-panel-action-icon-size)] shrink-0 cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
        style="--stroke-0: #E35A1D"
        onclick={cancelEdit}
        title="Cancel edit"
      >{@html Icons.close}</button>
    </div>
  {:else}
    <div class="flex items-center gap-2" style="padding: clamp(6px, 0.89vh, 8px) clamp(10px, 0.76vw, 12px) clamp(6px, 0.89vh, 8px) clamp(12px, 1.04vw, 16px);">
      <span class="text-dtcc-orange font-semibold whitespace-nowrap select-none"
        style="font-size: var(--atlas-session-font-size); line-height: var(--atlas-session-line-height);">
        {copied ? 'Copied!' : sessionCode}
      </span>
      {#if state === 'expanded'}
        <div class="flex items-center gap-2 ml-1">
          <button
            class="w-[var(--atlas-panel-action-icon-size)] h-[var(--atlas-panel-action-icon-size)] shrink-0 cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
            style="--stroke-0: #E35A1D"
            onclick={handlePenClick}
            title="Edit session code"
          >{@html Icons.pen}</button>
          <button
            class="w-[var(--atlas-panel-action-icon-size)] h-[var(--atlas-panel-action-icon-size)] shrink-0 cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
            style="--stroke-0: #E35A1D"
            onclick={handleCopy}
            title="Copy session code"
          >{@html Icons.copy}</button>
          <button
            class="w-[var(--atlas-panel-action-icon-size)] h-[var(--atlas-panel-action-icon-size)] shrink-0 cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
            style="--stroke-0: #E35A1D"
            onclick={handleShare}
            title="Share session link"
          >{@html Icons.share}</button>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Share URL popup -->
  {#if sharePopupVisible}
    <div class="absolute top-full right-0 mt-2
      flex items-center gap-2
      bg-white/50 backdrop-blur-xl
      border border-white/20
      shadow-[0_0_30px_rgba(255,255,255,0.15)]
      rounded-2xl px-3 py-2 z-50">
      <input
        readonly
        value={shareUrl}
        class="text-[var(--atlas-body-text-size)] text-dtcc-dark bg-transparent outline-none select-all font-medium"
        style="width: var(--atlas-session-share-width);"
        onclick={(e) => (e.currentTarget as HTMLInputElement).select()}
      />
      <button
        class="shrink-0 text-[var(--atlas-caption-text-size)] font-semibold cursor-pointer
          {shareCopied ? 'text-green-600' : 'text-dtcc-orange hover:text-dtcc-orange-dark'}
          transition-colors"
        onclick={copyShareUrl}
      >{shareCopied ? 'Copied!' : 'Copy'}</button>
    </div>
  {/if}
</div>

<style>
  /* Session icons fill their 24px wrapper proportionally (Figma 150-1660: 34x35 NavItem wrappers).
     At 22px with stroke-width:2, visual weight matches sidebar icons scaled to capsule context. */
  button :global(svg) {
    width: var(--atlas-session-icon-size);
    height: var(--atlas-session-icon-size);
  }
</style>
