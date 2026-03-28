<script lang="ts">
  import FloatingPanel from './FloatingPanel.svelte'
  import LayerTag from './LayerTag.svelte'
  import { layers, toggleLayerVisibility, toggleLayerExpanded, reorderLayers } from '../stores/layers'
  import { activePanel } from '../stores/ui'

  // TODO: Add layer button -- not yet implemented.
  // A mechanism for the user to add new layers to the layers panel is needed.
  // Awaiting design decision on button placement and layer creation flow.
  // Revisit in a future pass.

  let panelEl: HTMLElement
  let dragIndex: number | null = $state(null)
  let dropIndex: number | null = $state(null)

  function handleClose() {
    activePanel.set(null)
  }

  function handleDragStart(index: number) {
    return (e: DragEvent) => {
      dragIndex = index
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(index))
      }
    }
  }

  function handleDragOver(index: number) {
    return (e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
      dropIndex = index
    }
  }

  function handleDrop(index: number) {
    return (e: DragEvent) => {
      e.preventDefault()
      if (dragIndex !== null && dragIndex !== index) {
        reorderLayers(dragIndex, index)
      }
      dragIndex = null
      dropIndex = null
    }
  }

  function handleDragEnd() {
    dragIndex = null
    dropIndex = null
  }

  // Responsive scaling: same mechanism as Toolbar.svelte sidebar scaling.
  // Panel scales proportionally to match the sidebar when viewport is too short.
  // Margins also scale so the panel tracks the sidebar position correctly.
  $effect(() => {
    if (!panelEl) return
    function updateScale() {
      const topOffset = 77
      const bottomMargin = 16
      const available = window.innerHeight - topOffset - bottomMargin
      const scale = Math.min(1, available / 633)
      const margin = 16 * scale
      const scaledTopOffset = margin + 49 * scale + 12 * scale
      // left offset: margin(16) + toolbar width(75) + gap(16) = 107 at scale=1
      const scaledLeftOffset = margin + 75 * scale + 16 * scale
      panelEl.style.transform = `scale(${scale})`
      panelEl.style.transformOrigin = 'top left'
      panelEl.style.top = `${scaledTopOffset}px`
      panelEl.style.left = `${scaledLeftOffset}px`
    }
    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  })
</script>

<!-- Layers panel: floating, docked right of sidebar -->
<div
  bind:this={panelEl}
  class="absolute z-30
    max-sm:inset-0
    sm:w-[360px]
    animate-panel-in"
  style="max-height: calc(100vh - 160px);"
>
  <FloatingPanel title="Layers" onClose={handleClose}>
    {#if $layers.length === 0}
      <div class="flex-1 flex items-center justify-center h-full">
        <p class="text-sm text-dtcc-muted select-none">No layers yet</p>
      </div>
    {:else}
      <div class="flex flex-col gap-[7px]" role="list">
        {#each $layers as layer, index (layer.id)}
          {#if index > 0}
            <div class="h-px bg-white/20 mx-4"></div>
          {/if}
          <LayerTag
            {layer}
            onToggleVisibility={() => toggleLayerVisibility(layer.id)}
            onToggleExpanded={() => toggleLayerExpanded(layer.id)}
            onDragStart={handleDragStart(index)}
            onDragOver={handleDragOver(index)}
            onDrop={handleDrop(index)}
            onDragEnd={handleDragEnd}
            dragging={dragIndex === index}
            dropTarget={dropIndex === index && dragIndex !== index}
          />
        {/each}
      </div>
    {/if}
  </FloatingPanel>
</div>

<style>
  @keyframes panel-in {
    from { opacity: 0; transform: translateX(-8px); }
    to { opacity: 1; transform: translateX(0); }
  }
  .animate-panel-in {
    animation: panel-in 200ms ease-out;
  }
</style>
