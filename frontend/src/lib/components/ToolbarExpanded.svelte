<script lang="ts">
  import { get } from 'svelte/store'
  import { Icons } from '../ui/icons'
  import { fetchDatasetList } from '../api/dataset-api'
  import { datasets } from '../stores/datasets'
  import { drawingActive, activePanel, searchOpen, is3D, unseenBookmarks, unseenDatasets, unseenLayers, unseenDownloads, unseenSimulations, aoiNotificationShown, sideNavOpen, layersOpen } from '../stores/ui'
  import { activeJobCount } from '../stores/jobs'
  import { bbox } from '../stores/map'

  interface Props {
    onClear?: () => void
    onToggle3D?: () => void
  }

  let { onClear, onToggle3D }: Props = $props()

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

<!-- Expanded toolbar — same height as ToolbarV1, panel-style radius, icon + label rows -->
<div
  class="glass-toolbar fixed z-30 transition-transform duration-300 ease-out
    top-[var(--atlas-layout-top)] left-[var(--atlas-edge-gap)]
    flex flex-col h-[var(--atlas-docked-panel-height)] max-h-[var(--atlas-toolbar-natural-height)]
    w-[200px] rounded-[var(--atlas-panel-radius)]
    px-[var(--atlas-toolbar-padding-x)] py-[var(--atlas-toolbar-padding-y)]
    justify-between"
  style="
    {$sideNavOpen ? 'transform: translateX(calc(171px + var(--atlas-panel-gap)));' : ''}
    position: fixed !important;
  "
>

  <!-- Actions group -->
  <div class="flex flex-col gap-0.5">
    {@render row({ icon: Icons.draw, label: 'Draw area', active: $drawingActive, onclick: () => drawingActive.update(v => !v) })}
    {@render row({ icon: Icons.clear, label: 'Cancel', disabled: !$bbox && !$drawingActive, onclick: onClear })}
    {@render row({ icon: Icons.bookmark, label: 'Bookmarks', active: $activePanel === 'bookmarks', badge: $unseenBookmarks,
      onclick: () => { unseenBookmarks.set(0); if ($activePanel === 'bookmarks') aoiNotificationShown.set(false); activePanel.update(v => v === 'bookmarks' ? null : 'bookmarks') }
    })}
  </div>

  {@render divider()}

  <!-- Data group -->
  <div class="flex flex-col gap-0.5">
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
  </div>

  {@render divider()}

  <!-- Tools group -->
  <div class="flex flex-col gap-0.5">
    {@render row({ icon: Icons.search, label: 'Search', active: $searchOpen, onclick: () => searchOpen.update(v => !v) })}
    {@render row({ icon: $is3D ? Icons.view2d : Icons.view3d, label: $is3D ? '2D view' : '3D view', onclick: onToggle3D })}
  </div>

</div>

{#snippet row({ icon, label, active = false, disabled = false, badge = 0, onclick }: {
  icon: string; label: string; active?: boolean; disabled?: boolean; badge?: number; onclick?: () => void
})}
  <button
    class="flex items-center w-full rounded-xl px-2 transition-colors duration-150
      {active ? 'bg-dtcc-orange/10' : 'hover:bg-black/5'}
      {disabled ? 'opacity-30 pointer-events-none' : 'cursor-pointer'}"
    style="height: calc(var(--atlas-nav-item-height) * 0.95); gap: calc(var(--atlas-nav-item-width) * 0.3); {active ? '--stroke-0: #E35A1D' : ''}"
    {disabled}
    onclick={onclick}
    aria-label={label}
  >
    <span class="shrink-0" style="width: calc(var(--atlas-nav-icon-size) * 0.95); height: calc(var(--atlas-nav-icon-size) * 0.95);">
      {@html icon}
    </span>
    <span class="flex-1 text-left font-medium whitespace-nowrap"
      style="font-size: var(--atlas-body-text-size); color: {active ? 'var(--color-dtcc-orange)' : 'rgba(0,0,0,0.55)'};">
      {label}
    </span>
    {#if badge > 0}
      <span class="shrink-0 flex items-center justify-center rounded-full bg-dtcc-orange text-white font-semibold"
        style="min-width: 18px; height: 18px; font-size: 10px; padding: 0 4px;">
        {badge}
      </span>
    {/if}
  </button>
{/snippet}

{#snippet divider()}
  <div class="shrink-0 w-full h-px opacity-10 bg-[#5F5F6D] rounded-full"></div>
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
    border-radius: var(--atlas-panel-radius);
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
