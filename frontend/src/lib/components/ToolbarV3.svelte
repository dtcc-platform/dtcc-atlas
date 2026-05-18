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
  class="glass-toolbar fixed z-30
    top-[var(--atlas-layout-top)] left-[var(--atlas-edge-gap)]
    flex flex-col items-center h-[var(--atlas-docked-panel-height)] max-h-[var(--atlas-toolbar-natural-height)]
    px-[var(--atlas-toolbar-padding-x)] py-[var(--atlas-toolbar-padding-y)]
    justify-between"
  style="
    width: {hovered ? '200px' : 'var(--atlas-sidebar-width)'};
    border-radius: {borderRadius};
    transition: width 200ms ease-out, transform 300ms ease-out;
    {$sideNavOpen ? 'transform: translateX(calc(171px + var(--atlas-panel-gap)));' : ''}
    position: fixed !important;
  "  onmouseenter={onEnter}
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
    class="relative flex items-center rounded-xl transition-colors duration-150
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

    <!-- Collapsed dot — anchored to top-right corner of the highlight box -->
    {#if badge > 0}
      <span
        class="absolute rounded-full bg-dtcc-orange text-white font-semibold flex items-center justify-center"
        style="
          min-width: 14px; height: 14px; font-size: 8px; padding: 0 3px;
          top: 2px; right: 2px;
          opacity: {hovered ? '0' : '1'};
          transition: opacity 150ms ease-out;
        "
      >{badge}</span>
    {/if}

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

    <!-- Full badge — fades in with label when expanded -->
    {#if badge > 0}
      <span
        class="shrink-0 flex items-center justify-center rounded-full bg-dtcc-orange text-white font-semibold"
        style="
          min-width: 18px; height: 18px; font-size: 10px; padding: 0 4px;
          margin-right: 8px;
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
  .glass-toolbar {
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
  .glass-toolbar::before {
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

  span :global(svg) { width: 100%; height: 100%; }
</style>
