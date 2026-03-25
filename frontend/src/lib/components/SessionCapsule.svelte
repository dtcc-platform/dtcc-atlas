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

  // Clean up timers on destroy
  $effect(() => {
    return () => {
      if (collapseTimer) clearTimeout(collapseTimer)
      if (copiedTimer) clearTimeout(copiedTimer)
    }
  })

  function startCollapseTimer() {
    clearCollapseTimer()
    collapseTimer = setTimeout(() => {
      if (state === 'expanded') state = 'collapsed'
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
    // Uses window.location.origin so URLs work in all environments (dev, staging, prod)
    const url = `${window.location.origin}/s/${sessionCode}`
    navigator.clipboard.writeText(url).then(showCopiedFeedback)
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
  class="flex items-center h-[40px] rounded-[100px] transition-all duration-200"
  role="group"
  aria-label="Session controls"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
>
  {#if state === 'editing'}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- onkeydown on container so Escape is caught even when focus is on buttons, not just the input -->
    <div class="flex items-center gap-1.5 pt-[11px] pr-[12px] pb-[10px] pl-[19px]" onkeydown={handleKeydown}>
      <input
        bind:this={inputEl}
        bind:value={editValue}
        class="w-[90px] bg-transparent border-b border-dtcc-orange/50 text-dtcc-orange font-semibold text-[16px] leading-[24px] outline-none"
      />
      <button
        class="w-[16px] h-[16px] shrink-0 cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
        onclick={handlePenClick}
        title="Confirm edit"
      >{@html Icons.pen}</button>
      <button
        class="w-[16px] h-[16px] shrink-0 cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
        onclick={cancelEdit}
        title="Cancel edit"
      >{@html Icons.close}</button>
    </div>
  {:else}
    <div class="flex items-center gap-1.5 pt-[11px] pr-[12px] pb-[10px] pl-[19px]">
      <span class="text-dtcc-orange font-semibold text-[16px] leading-[24px] whitespace-nowrap select-none">
        {copied ? 'Copied!' : sessionCode}
      </span>
      {#if state === 'expanded'}
        <div class="flex items-center gap-1 ml-1">
          <button
            class="w-[16px] h-[16px] shrink-0 cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
            onclick={handlePenClick}
            title="Edit session code"
          >{@html Icons.pen}</button>
          <button
            class="w-[16px] h-[16px] shrink-0 cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
            onclick={handleCopy}
            title="Copy session code"
          >{@html Icons.copy}</button>
          <button
            class="w-[16px] h-[16px] shrink-0 cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
            onclick={handleShare}
            title="Copy session URL"
          >{@html Icons.share}</button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Render session capsule icons at 16x16 */
  button :global(svg) {
    width: 16px;
    height: 16px;
  }
</style>
