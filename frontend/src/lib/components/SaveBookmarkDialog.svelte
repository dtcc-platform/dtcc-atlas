<script lang="ts">
  import { bboxArea } from '../stores/map'
  import { slide } from 'svelte/transition'

  interface Props {
    open: boolean
    onSave?: () => void
    onClose?: () => void
  }

  let { open = $bindable(), onSave, onClose }: Props = $props()

  function handleSave() {
    onSave?.()
    open = false
  }

  function handleDismiss() {
    open = false
    onClose?.()
  }
</script>

{#if open}
  <div transition:slide={{ duration: 200 }} class="hidden sm:flex fixed left-1/2 z-30
    h-[var(--atlas-bottom-bar-height)] items-center
    bg-white/50 backdrop-blur-xl border border-white/20 shadow-[0_0_30px_rgba(255,255,255,0.15)]
    rounded-[999px] px-[var(--atlas-bottom-bar-padding-x)] gap-2 whitespace-nowrap"
    style="bottom: var(--atlas-edge-gap); transform: translateX(-50%);"
  >
    <span class="text-[#5F5F6D] font-light tracking-[-0.18px] select-none"
      style="font-size: var(--atlas-helper-font-size); line-height: var(--atlas-helper-line-height);">Save area as bookmark?</span>
    <div class="flex gap-1.5">
      <button
        class="px-3 py-1 rounded-full text-xs font-medium text-dtcc-muted bg-white/30 hover:bg-white/50 transition-colors cursor-pointer
          focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
        onclick={handleDismiss}
      >
        Dismiss
      </button>
      <button
        class="px-3 py-1 rounded-full text-xs font-medium bg-dtcc-orange text-white hover:bg-dtcc-orange-dark transition-colors cursor-pointer
          focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
        onclick={handleSave}
      >
        Save
      </button>
    </div>
  </div>
{/if}
