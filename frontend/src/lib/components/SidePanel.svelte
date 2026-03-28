<script lang="ts">
  import { activePanel } from '../stores/ui'
  import FloatingPanel from './FloatingPanel.svelte'
  import type { Snippet } from 'svelte'

  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()
  let visible = $state(false)
  let animatingOut = $state(false)
  let panelEl: HTMLElement

  // Layers panel uses its own floating panel docked to the sidebar.
  // Datasets panel uses its own multi-panel stack (DatasetList.svelte).
  const panelActive = $derived($activePanel !== null && $activePanel !== 'layers' && $activePanel !== 'datasets')

  // Panel title derived from active panel type
  const panelTitle = $derived.by(() => {
    switch ($activePanel) {
      case 'dataset-form': return 'Datasets'
      case 'bookmarks': return 'Bookmarks'
      case 'uploads': return 'Upload'
      case 'downloads': return 'Downloads'
      default: return ''
    }
  })

  $effect(() => {
    if (panelActive) {
      visible = true
      animatingOut = false
    } else if (visible) {
      animatingOut = true
      setTimeout(() => {
        visible = false
        animatingOut = false
      }, 200)
    }
  })

  // Responsive scaling: same mechanism as Toolbar.svelte sidebar scaling.
  // Margins also scale so the panel tracks the navbar positions correctly.
  $effect(() => {
    if (!panelEl) return
    function updateScale() {
      const topOffset = 77
      const bottomMargin = 16
      const available = window.innerHeight - topOffset - bottomMargin
      const scale = Math.min(1, available / 633)
      const margin = 16 * scale
      const scaledTopOffset = margin + 49 * scale + 12 * scale
      panelEl.style.transform = `scale(${scale})`
      panelEl.style.transformOrigin = 'top right'
      panelEl.style.top = `${scaledTopOffset}px`
      panelEl.style.right = `${margin}px`
    }
    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  })

  function handleClose() {
    activePanel.set(null)
  }
</script>

{#if visible}
  <div
    bind:this={panelEl}
    class="absolute z-30
      max-sm:inset-0
      sm:w-[360px]
      overflow-hidden
      {animatingOut ? 'animate-panel-out' : 'animate-panel-in'}"
    style="max-height: calc(100vh - 160px);"
  >
    <FloatingPanel title={panelTitle} onClose={handleClose} class="h-full">
      {@render children()}
    </FloatingPanel>
  </div>
{/if}

<style>
  @keyframes panel-in {
    from { opacity: 0; transform: translateX(8px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes panel-out {
    from { opacity: 1; transform: translateX(0); }
    to { opacity: 0; transform: translateX(8px); }
  }
  .animate-panel-in {
    animation: panel-in 200ms ease-out;
  }
  .animate-panel-out {
    animation: panel-out 200ms ease-in forwards;
  }
</style>
