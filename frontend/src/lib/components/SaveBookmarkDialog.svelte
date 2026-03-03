<script lang="ts">
  import { bboxArea } from '../stores/map'

  interface Props {
    open: boolean
    onSave?: (name: string) => void
    onClose?: () => void
  }

  let { open = $bindable(), onSave, onClose }: Props = $props()
  let name = $state('')
  let inputEl: HTMLInputElement | undefined = $state(undefined)

  $effect(() => {
    if (open && inputEl) setTimeout(() => inputEl?.focus(), 50)
  })

  function handleSave() {
    if (!name.trim()) return
    onSave?.(name.trim())
    name = ''
    open = false
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
  <button class="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm cursor-default focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none" aria-label="Close dialog" onclick={() => { open = false; onClose?.() }}></button>
  <div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50
    w-[360px] bg-white rounded-xl shadow-2xl p-5"
    role="dialog"
    aria-modal="true"
    onkeydown={trapFocus}>
    <h3 class="text-[16px] font-semibold text-dtcc-navy mb-1">Save Bookmark</h3>
    <p class="text-[12px] text-dtcc-muted mb-4">Area: {$bboxArea.toFixed(2)} km²</p>
    <input
      bind:this={inputEl}
      bind:value={name}
      placeholder="Bookmark name..."
      class="w-full h-9 px-3 rounded-lg border border-dtcc-border-light text-[13px] mb-4
        focus:outline-none focus:ring-2 focus:ring-dtcc-orange/30 focus:border-dtcc-orange"
      onkeydown={(e) => e.key === 'Enter' && handleSave()}
    />
    <div class="flex gap-2 justify-end">
      <button class="px-4 h-9 rounded-lg text-[13px] text-dtcc-muted hover:bg-black/5 cursor-pointer focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none" onclick={() => { open = false; onClose?.() }}>Cancel</button>
      <button
        class="px-4 h-9 rounded-lg bg-dtcc-orange text-white text-[13px] font-semibold hover:bg-dtcc-orange-dark cursor-pointer focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
        onclick={handleSave}
      >Save</button>
    </div>
  </div>
{/if}
