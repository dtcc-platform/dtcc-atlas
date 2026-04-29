<script lang="ts">
  import FloatingPanel from './FloatingPanel.svelte'
  import LayerTag from './LayerTag.svelte'
  import { layers, toggleLayerVisibility, toggleLayerExpanded, reorderLayers, setLayerOpacity, zoomToLayer } from '../stores/layers'
  import { activePanel, collapsedPanels, togglePanelCollapsed, toolbarHovered, layersOpen } from '../stores/ui'

  // TODO: Add layer button -- not yet implemented.
  // A mechanism for the user to add new layers to the layers panel is needed.
  // Awaiting design decision on button placement and layer creation flow.
  // Revisit in a future pass.

  let dragIndex: number | null = $state(null)
  let dropIndex: number | null = $state(null)
  const panelId = 'layers:main'

  function handleClose() {
    layersOpen.set(false)
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
</script>

<!-- Layers panel: floating, docked right of sidebar -->
<div
  class="fixed z-30
    max-sm:inset-0
    sm:w-[var(--atlas-panel-width)]
    animate-panel-in"
  style="top: var(--atlas-layout-top); left: calc(var(--atlas-edge-gap) + {$toolbarHovered ? '200px' : 'var(--atlas-sidebar-width)'} + var(--atlas-panel-gap)); height: var(--atlas-toolbar-natural-height); transition: left 200ms ease-out;"
>
  <FloatingPanel
    title="Layers"
    panelId={panelId}
    collapsed={Boolean($collapsedPanels[panelId])}
    onToggleCollapsed={() => togglePanelCollapsed(panelId)}
    onClose={handleClose}
    class={Boolean($collapsedPanels[panelId]) ? 'h-[var(--atlas-panel-collapsed-height)] self-start' : 'h-full'}
  >
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
            onOpacityChange={(opacity) => setLayerOpacity(layer.id, opacity)}
            onZoomToLayer={() => zoomToLayer(layer.id)}
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
