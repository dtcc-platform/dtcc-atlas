<script lang="ts">
  import { onDestroy } from 'svelte'
  import { activePanel, collapsedPanels, togglePanelCollapsed } from '../stores/ui'
  import { selectedDataset } from '../stores/datasets'
  import { Icons } from '../ui/icons'
  import FloatingPanel from './FloatingPanel.svelte'
  import type { Snippet } from 'svelte'
  import type { PanelView } from '../stores/ui'

  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()
  let renderedPanel = $state<Exclude<PanelView, 'datasets' | 'layers'> | null>(null)
  let animatingOut = $state(false)
  let hideTimer: ReturnType<typeof setTimeout> | null = null

  // Layers, datasets, and simulations each use their own dedicated components.
  const nextPanel = $derived.by(() => {
    if ($activePanel === null || $activePanel === 'layers' || $activePanel === 'datasets' || $activePanel === 'simulations') {
      return null
    }
    return $activePanel
  })
  const currentPanel = $derived(nextPanel ?? renderedPanel)
  const panelId = $derived(currentPanel ? `side:${currentPanel}` : '')
  const collapsed = $derived(panelId ? Boolean($collapsedPanels[panelId]) : false)

  // Panel title derived from active panel type
  const panelTitle = $derived.by(() => {
    switch (currentPanel) {
      case 'dataset-form': return $selectedDataset?.title || $selectedDataset?.name || 'Configure Dataset'
      case 'bookmarks': return 'Bookmarks'
      case 'uploads': return 'Upload'
      case 'downloads': return 'Downloads'
      default: return ''
    }
  })

  const leadingActionIcon = $derived(currentPanel === 'dataset-form' ? Icons.arrowLeft : undefined)
  const leadingActionLabel = $derived(currentPanel === 'dataset-form' ? 'Back to datasets' : '')

  $effect(() => {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }

    if (nextPanel) {
      renderedPanel = nextPanel
      animatingOut = false
      // Always open panels expanded — clear any stale collapsed state from a previous session
      collapsedPanels.update(s => ({ ...s, [`side:${nextPanel}`]: false }))
      return
    }

    if (renderedPanel) {
      animatingOut = true
      hideTimer = setTimeout(() => {
        renderedPanel = null
        animatingOut = false
        hideTimer = null
      }, 200)
    } else {
      animatingOut = false
    }

    return () => {
      if (hideTimer) {
        clearTimeout(hideTimer)
        hideTimer = null
      }
    }
  })

  onDestroy(() => {
    if (hideTimer) clearTimeout(hideTimer)
  })

  function handleClose() {
    activePanel.set(null)
  }

  function goBack() {
    activePanel.set('datasets')
  }
</script>

{#if currentPanel}
  <div
    class="fixed z-30
      overflow-visible
      {animatingOut ? 'animate-panel-out' : 'animate-panel-in'}"
    style="top: var(--atlas-layout-top); left: var(--atlas-topbar-right-left); right: var(--atlas-edge-gap); height: var(--atlas-toolbar-natural-height);"
  >
    <div style="height: {collapsed ? 'var(--atlas-panel-collapsed-height)' : '100%'}; transition: height 200ms ease-out; overflow: visible;">
      <FloatingPanel
        title={panelTitle}
        panelId={panelId}
        collapsed={collapsed}
        onToggleCollapsed={() => panelId && togglePanelCollapsed(panelId)}
        onClose={handleClose}
        leadingActionIcon={leadingActionIcon}
        leadingActionLabel={leadingActionLabel}
        onLeadingAction={currentPanel === 'dataset-form' ? goBack : undefined}
        class="h-full"
      >
        {@render children()}
      </FloatingPanel>
    </div>
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
