<script lang="ts">
  import { sessionId } from '../stores/session'

  interface Props {
    open: boolean
  }

  let { open = $bindable() }: Props = $props()
  let resumeHash = $state('')
  let copied = $state(false)
  let inputEl: HTMLInputElement | undefined = $state(undefined)

  $effect(() => {
    if (open && inputEl) setTimeout(() => inputEl?.focus(), 50)
  })

  function sessionUrl(): string {
    return `${window.location.origin}/s/${$sessionId}`
  }

  function copyUrl() {
    navigator.clipboard.writeText(sessionUrl()).then(() => {
      copied = true
      setTimeout(() => copied = false, 1500)
    })
  }

  function handleResume() {
    const hash = resumeHash.trim()
    if (!hash) return
    // Navigate to the session URL (full page load to reinitialize)
    window.location.href = `/s/${hash}`
  }

  function trapFocus(e: KeyboardEvent) {
    if (e.key !== 'Tab') return
    const dialog = e.currentTarget as HTMLElement
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_consider_explicit_label -->
  <button class="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm cursor-default focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none" aria-label="Close dialog" onclick={() => open = false}></button>
  <div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50
    w-[min(92vw,400px)] bg-white rounded-[var(--atlas-panel-radius)] shadow-2xl p-[var(--atlas-panel-padding)]"
    role="dialog" aria-modal="true" tabindex="-1"    onkeydown={(e) => { if (e.key === 'Escape') open = false; trapFocus(e) }}>

    <h3 class="text-[var(--atlas-panel-header-title-size)] font-semibold text-dtcc-navy mb-4">Session</h3>

    <!-- Current session -->
    <div class="mb-5">
      <p class="text-[var(--atlas-caption-text-size)] text-dtcc-muted font-medium uppercase tracking-wide mb-1.5 block">Your session URL</p>
      <div class="flex gap-2">
        <div class="flex-1 h-[var(--atlas-control-height)] px-[var(--atlas-control-padding-x)] rounded-[var(--atlas-control-radius)] border border-dtcc-border-light bg-gray-50 text-[var(--atlas-body-text-size)] font-mono text-dtcc-navy flex items-center overflow-hidden">
          <span class="truncate">{$sessionId ? sessionUrl() : '...'}</span>
        </div>
        <button
          class="px-3 h-[var(--atlas-control-height)] rounded-[var(--atlas-control-radius)] bg-dtcc-orange text-white text-[var(--atlas-caption-text-size)] font-semibold hover:bg-dtcc-orange-dark cursor-pointer whitespace-nowrap focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
          onclick={copyUrl}
        >{copied ? 'Copied!' : 'Copy'}</button>
      </div>
      <p class="text-[var(--atlas-caption-text-size)] text-dtcc-muted mt-1.5">Share this URL to resume your session from any device.</p>
    </div>

    <!-- Divider -->
    <div class="border-t border-dtcc-border-light mb-5"></div>

    <!-- Resume another session -->
    <div>
      <label for="resume-session-hash" class="text-[var(--atlas-caption-text-size)] text-dtcc-muted font-medium uppercase tracking-wide mb-1.5 block">Resume another session</label>
      <div class="flex gap-2">
        <input
          id="resume-session-hash"
          bind:this={inputEl}
          bind:value={resumeHash}
          placeholder="Enter session hash..."
          class="flex-1 h-[var(--atlas-control-height)] px-[var(--atlas-control-padding-x)] rounded-[var(--atlas-control-radius)] border border-dtcc-border-light text-[var(--atlas-body-text-size)] font-mono
            focus:outline-none focus:ring-2 focus:ring-dtcc-orange/30 focus:border-dtcc-orange"
          onkeydown={(e) => e.key === 'Enter' && handleResume()}
        />
        <button
          class="px-3 h-[var(--atlas-control-height)] rounded-[var(--atlas-control-radius)] border border-dtcc-border-light text-[var(--atlas-body-text-size)] text-dtcc-navy font-medium hover:bg-black/5 cursor-pointer whitespace-nowrap focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!resumeHash.trim()}
          onclick={handleResume}
        >Go</button>
      </div>
    </div>

    <!-- Close -->
    <div class="flex justify-end mt-5">
      <button class="px-4 h-[var(--atlas-control-height)] rounded-[var(--atlas-control-radius)] text-[var(--atlas-body-text-size)] text-dtcc-muted hover:bg-black/5 cursor-pointer focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none" onclick={() => open = false}>Close</button>
    </div>
  </div>
{/if}
