<script lang="ts">
  import { get } from 'svelte/store'
  import ToolbarButton from './ToolbarButton.svelte'
  import { Icons } from '../ui/icons'
  import { fetchDatasetList } from '../api/dataset-api'
  import { datasets } from '../stores/datasets'
  import { drawingActive, activePanel, searchOpen, is3D, unseenBookmarks, unseenDatasets, unseenLayers, unseenDownloads, unseenSimulations, aoiNotificationShown, sideNavOpen } from '../stores/ui'
  import { activeJobCount } from '../stores/jobs'
  import { bbox } from '../stores/map'

  interface Props {
    onClear?: () => void
    onToggle3D?: () => void
  }

  let { onClear, onToggle3D }: Props = $props()

  async function toggleDatasetsPanel() {
    const current = get(activePanel)
    if (current === 'datasets') {
      activePanel.set(null)
      return
    }

    activePanel.set('datasets')
    try {
      const list = await fetchDatasetList()
      datasets.set(list)
    } catch (error) {
      console.warn('Failed to refresh dataset list:', error)
    }
  }

  async function toggleSimulationsPanel() {
    const current = get(activePanel)
    if (current === 'simulations') {
      activePanel.set(null)
      return
    }

    activePanel.set('simulations')
    try {
      const list = await fetchDatasetList()
      datasets.set(list)
    } catch (error) {
      console.warn('Failed to refresh simulations list:', error)
    }
  }
</script>

<!-- Anchored below TopNavBar: margin + topbar(49) + gap(12) -- positioned dynamically via JS scaling -->
<div class="fixed z-20 sm:z-30 transition-transform duration-300 ease-out
  max-sm:bottom-4 max-sm:left-4 max-sm:right-4 max-sm:flex-row max-sm:justify-around max-sm:rounded-full max-sm:px-2 max-sm:py-2.5 max-sm:gap-0.5
  sm:top-[var(--atlas-layout-top)] sm:left-[var(--atlas-edge-gap)]
  sm:flex-col sm:w-[var(--atlas-sidebar-width)] sm:h-[var(--atlas-docked-panel-height)] sm:max-h-[var(--atlas-toolbar-natural-height)] sm:rounded-[999px]
  sm:px-[var(--atlas-toolbar-padding-x)] sm:py-[var(--atlas-toolbar-padding-y)] sm:justify-between
  flex items-center bg-white/50 backdrop-blur-xl shadow-[0_0_30px_rgba(255,255,255,0.15)] border border-white/20"
  style={$sideNavOpen ? 'transform: translateX(calc(171px + var(--atlas-panel-gap)))' : ''}>
  <!-- Actions group -->
  <ToolbarButton
    icon={Icons.draw}
    label="Draw area"
    active={$drawingActive}
    onclick={() => drawingActive.update(v => !v)}
  />
  <ToolbarButton
    icon={Icons.clear}
    label="Cancel"
    disabled={!$bbox && !$drawingActive}
    onclick={onClear}
  />
  <ToolbarButton
    icon={Icons.bookmark}
    label="Bookmarks"
    active={$activePanel === 'bookmarks'}
    badge={$unseenBookmarks}
    showDot={$aoiNotificationShown}
    onclick={() => {
      unseenBookmarks.set(0)
      // Closing the bookmarks panel dismisses the AOI save notification (spec §2.1)
      if ($activePanel === 'bookmarks') aoiNotificationShown.set(false)
      activePanel.update(v => v === 'bookmarks' ? null : 'bookmarks')
    }}
  />

  <!-- Divider: 50px wide × 10px tall, opacity 10% — exact Figma spec (node 85-1794) -->
  <div class="shrink-0" style="width: calc(var(--atlas-nav-item-width) * 0.95); height: calc(10px * 0.95); opacity: 0.1;">
    <svg viewBox="0 0 50 10" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style="color: #5F5F6D">
      <path d="M2 5L48 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
  </div>

  <!-- Data group -->
  <!-- TODO: unseenDatasets has no trigger yet. It should fire when new DTCC Core
       or simulation datasets are added to the catalogue, not on job completion.
       Job completion notifications now route to the downloads icon instead. -->
  <ToolbarButton
    icon={Icons.dataTree}
    label="Datasets"
    active={$activePanel === 'datasets' || $activePanel === 'dataset-form'}
    badge={$unseenDatasets}
    onclick={() => {
      unseenDatasets.set(0)
      toggleDatasetsPanel()
    }}
  />
  <ToolbarButton
    icon={Icons.simulation}
    label="Simulations"
    active={$activePanel === 'simulations'}
    badge={$unseenSimulations}
    onclick={() => {
      unseenSimulations.set(0)
      toggleSimulationsPanel()
    }}
  />
  <ToolbarButton
    icon={Icons.layers}
    label="Layers"
    active={$activePanel === 'layers'}
    badge={$unseenLayers}
    onclick={() => {
      unseenLayers.set(0)
      activePanel.update(v => v === 'layers' ? null : 'layers')
    }}
  />
  <ToolbarButton
    icon={Icons.download}
    label="Download"
    active={$activePanel === 'downloads'}
    badge={$unseenDownloads + $activeJobCount}
    onclick={() => {
      unseenDownloads.set(0)
      activePanel.update(v => v === 'downloads' ? null : 'downloads')
    }}
  />
  <ToolbarButton
    icon={Icons.upload}
    label="Upload"
    active={$activePanel === 'uploads'}
    onclick={() => activePanel.update(v => v === 'uploads' ? null : 'uploads')}
  />

  <!-- Divider: 50px wide × 10px tall, opacity 10% — exact Figma spec (node 85-1794) -->
  <div class="shrink-0" style="width: calc(var(--atlas-nav-item-width) * 0.95); height: calc(10px * 0.95); opacity: 0.1;">
    <svg viewBox="0 0 50 10" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style="color: #5F5F6D">
      <path d="M2 5L48 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
  </div>

  <!-- Tools group -->
  <ToolbarButton
    icon={Icons.search}
    label="Search"
    active={$searchOpen}
    onclick={() => searchOpen.update(v => !v)}
  />
  <ToolbarButton
    icon={$is3D ? Icons.view2d : Icons.view3d}
    label={$is3D ? '2D view' : '3D view'}
    onclick={onToggle3D}
  />
</div>
