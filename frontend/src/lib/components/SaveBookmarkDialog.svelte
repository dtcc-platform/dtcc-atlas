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
  <div transition:slide={{ duration: 200 }} class="glass-capsule hidden sm:flex fixed left-1/2 z-30
    h-[var(--atlas-bottom-bar-height)] items-center
    rounded-[999px] px-[var(--atlas-bottom-bar-padding-x)] gap-2 whitespace-nowrap"
    style="bottom: var(--atlas-edge-gap); transform: translateX(-50%); position: fixed !important;"
  >
    <span class="text-[#5F5F6D] font-light tracking-[-0.18px] select-none"
      style="font-size: var(--atlas-helper-font-size); line-height: var(--atlas-helper-line-height);">Save area as bookmark?</span>
    <div class="flex gap-1.5">
      <button
        class="px-3 py-1 rounded-full text-xs font-medium text-dtcc-muted bg-white/30 hover:bg-white/50 border border-black/15 transition-colors cursor-pointer
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

  /* Contour-aware specular highlight */
  .glass-capsule::before {
    content: '';
    position: absolute;
    inset: 0;
    padding: 2px;
    border-radius: inherit;
    /* Localized radial "shoulder pop" at top-left */
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
</style>
