<script lang="ts">
  import { get } from 'svelte/store'
  import { Icons } from '../ui/icons'
  import { fetchDatasetList } from '../api/dataset-api'
  import { datasets } from '../stores/datasets'
  import { drawingActive, activePanel, searchOpen, is3D, unseenBookmarks, unseenDatasets, unseenLayers, unseenDownloads, unseenSimulations, aoiNotificationShown, sideNavOpen, toolbarHovered, layersOpen } from '../stores/ui'
  import { activeJobCount } from '../stores/jobs'
  import { bbox } from '../stores/map'

  interface Props {
    onClear?: () => void
    onToggle3D?: () => void
  }

  let { onClear, onToggle3D }: Props = $props()

  let hovered = $state(false)
  let borderRadius = $state('999px')
  let collapseTimer: ReturnType<typeof setTimeout> | null = null
  let radiusTimer: ReturnType<typeof setTimeout> | null = null

  function onEnter() {
    if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null }
    if (radiusTimer) { clearTimeout(radiusTimer); radiusTimer = null }
    borderRadius = 'var(--atlas-panel-radius)'
    hovered = true
    toolbarHovered.set(true)
  }

  function onLeave() {
    collapseTimer = setTimeout(() => {
      collapseTimer = null
      hovered = false
      toolbarHovered.set(false)
      radiusTimer = setTimeout(() => { radiusTimer = null; borderRadius = '999px' }, 200)
    }, 300)
  }

  async function toggleDatasetsPanel() {
    const current = get(activePanel)
    if (current === 'datasets') { activePanel.set(null); return }
    activePanel.set('datasets')
    try { const list = await fetchDatasetList(); datasets.set(list) } catch {}
  }

  async function toggleSimulationsPanel() {
    const current = get(activePanel)
    if (current === 'simulations') { activePanel.set(null); return }
    activePanel.set('simulations')
    try { const list = await fetchDatasetList(); datasets.set(list) } catch {}
  }
</script>

<div
  class="fixed z-30
    top-[var(--atlas-layout-top)] left-[var(--atlas-edge-gap)]
    flex flex-col items-center h-[var(--atlas-docked-panel-height)] max-h-[var(--atlas-toolbar-natural-height)]
    px-[var(--atlas-toolbar-padding-x)] py-[var(--atlas-toolbar-padding-y)]
    justify-between overflow-hidden
    bg-white/50 backdrop-blur-xl shadow-[0_0_30px_rgba(255,255,255,0.15)] border border-white/20"
  style="
    width: {hovered ? '200px' : 'var(--atlas-sidebar-width)'};
    border-radius: {borderRadius};
    transition: width 200ms ease-out, transform 300ms ease-out;
    {$sideNavOpen ? 'transform: translateX(calc(171px + var(--atlas-panel-gap)))' : ''}
  "
  onmouseenter={onEnter}
  onmouseleave={onLeave}
  role="toolbar"
  tabindex="-1"
>
  {@render row({ icon: Icons.draw, label: 'Draw area', active: $drawingActive, onclick: () => drawingActive.update(v => !v) })}
  {@render row({ icon: Icons.clear, label: 'Cancel', disabled: !$bbox && !$drawingActive, onclick: onClear })}
  {@render row({ icon: Icons.bookmark, label: 'Bookmarks', active: $activePanel === 'bookmarks', badge: $unseenBookmarks,
    onclick: () => { unseenBookmarks.set(0); if ($activePanel === 'bookmarks') aoiNotificationShown.set(false); activePanel.update(v => v === 'bookmarks' ? null : 'bookmarks') }
  })}

  {@render divider()}

  {@render row({ icon: Icons.dataTree, label: 'Datasets', active: $activePanel === 'datasets' || $activePanel === 'dataset-form', badge: $unseenDatasets,
    onclick: () => { unseenDatasets.set(0); toggleDatasetsPanel() }
  })}
  {@render row({ icon: Icons.simulation, label: 'Simulations', active: $activePanel === 'simulations', badge: $unseenSimulations,
    onclick: () => { unseenSimulations.set(0); toggleSimulationsPanel() }
  })}
  {@render row({ icon: Icons.layers, label: 'Layers', active: $layersOpen, badge: $unseenLayers,
    onclick: () => { unseenLayers.set(0); layersOpen.update(v => !v) }
  })}
  {@render row({ icon: Icons.download, label: 'Download', active: $activePanel === 'downloads', badge: $unseenDownloads + $activeJobCount,
    onclick: () => { unseenDownloads.set(0); activePanel.update(v => v === 'downloads' ? null : 'downloads') }
  })}
  {@render row({ icon: Icons.upload, label: 'Upload', active: $activePanel === 'uploads',
    onclick: () => activePanel.update(v => v === 'uploads' ? null : 'uploads')
  })}

  {@render divider()}

  {@render row({ icon: Icons.search, label: 'Search', active: $searchOpen, onclick: () => searchOpen.update(v => !v) })}
  {@render row({ icon: $is3D ? Icons.view2d : Icons.view3d, label: $is3D ? '2D view' : '3D view', onclick: onToggle3D })}
</div>

{#snippet row({ icon, label, active = false, disabled = false, badge = 0, onclick }: {
  icon: string; label: string; active?: boolean; disabled?: boolean; badge?: number; onclick?: () => void
})}
  <button
    class="flex items-center rounded-xl transition-colors duration-150
      {active ? 'bg-dtcc-orange/10' : 'hover:bg-black/5'}
      {disabled ? 'opacity-30 pointer-events-none' : 'cursor-pointer'}"
    style="
      height: calc(var(--atlas-nav-item-height) * 0.95);
      width: {hovered ? 'calc(var(--atlas-nav-item-width) * 0.95 + 200px - var(--atlas-sidebar-width))' : 'calc(var(--atlas-nav-item-width) * 0.95)'};
      transition: width 200ms ease-out, background-color 150ms;
      {active ? '--stroke-0: #E35A1D' : ''}
    "
    {disabled}
    onclick={onclick}
    aria-label={label}
  >
    <!-- Fixed-width icon slot -->
    <span
      class="shrink-0 flex items-center justify-center"
      style="width: calc(var(--atlas-nav-item-width) * 0.95); height: calc(var(--atlas-nav-icon-size) * 0.95);"
    >
      <span style="width: calc(var(--atlas-nav-icon-size) * 0.95); height: calc(var(--atlas-nav-icon-size) * 0.95);">
        {@html icon}
      </span>
    </span>

    <!-- Label — fades in when expanded -->
    <span
      class="flex-1 text-left font-medium whitespace-nowrap overflow-hidden"
      style="
        font-size: var(--atlas-body-text-size);
        color: {active ? 'var(--color-dtcc-orange)' : 'rgba(0,0,0,0.55)'};
        opacity: {hovered ? '1' : '0'};
        max-width: {hovered ? '150px' : '0'};
        padding-left: {hovered ? '8px' : '0'};
        transition: opacity 150ms ease-out {hovered ? '80ms' : '0ms'}, max-width 200ms ease-out, padding-left 200ms ease-out;
      "
    >
      {label}
    </span>

    <!-- Badge — fades in with label -->
    {#if badge > 0}
      <span
        class="shrink-0 flex items-center justify-center rounded-full bg-dtcc-orange text-white font-semibold"
        style="
          min-width: 18px; height: 18px; font-size: 10px; padding: 0 4px;
          opacity: {hovered ? '1' : '0'};
          transition: opacity 150ms ease-out {hovered ? '80ms' : '0ms'};
        "
      >
        {badge}
      </span>
    {/if}
  </button>
{/snippet}

{#snippet divider()}
  <div
    class="shrink-0 bg-[#5F5F6D] rounded-full"
    style="
      width: {hovered ? 'calc(var(--atlas-nav-item-width) * 0.95 + 200px - var(--atlas-sidebar-width))' : 'calc(var(--atlas-nav-item-width) * 0.95)'};
      height: 1px;
      opacity: 0.1;
      transition: width 200ms ease-out;
    "
  ></div>
{/snippet}

<style>
  span :global(svg) { width: 100%; height: 100%; }
</style>
