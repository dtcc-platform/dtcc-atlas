<script lang="ts">
  import { get } from 'svelte/store'
  import ToolbarButton from './ToolbarButton.svelte'
  import { Icons } from '../ui/icons'
  import { fetchDatasetList } from '../api/dataset-api'
  import { datasets } from '../stores/datasets'
  import { drawingActive, activePanel, searchOpen, is3D, unseenBookmarks, unseenDatasets, unseenLayers, unseenDownloads } from '../stores/ui'
  import { activeJobCount } from '../stores/jobs'
  import { bbox } from '../stores/map'

  interface Props {
    onClear?: () => void
    onToggle3D?: () => void
  }

  let { onClear, onToggle3D }: Props = $props()
  let toolbarEl: HTMLDivElement

  // Responsive scaling: sidebar starts at 77px from top, needs 16px bottom margin.
  // Scale down proportionally when viewport is too short for the full 633px sidebar height.
  // Margins also scale so gaps shrink proportionally with the content.
  $effect(() => {
    if (!toolbarEl) return

    function updateScale() {
      const topOffset = 77
      const bottomMargin = 16
      const available = window.innerHeight - topOffset - bottomMargin
      const scale = Math.min(1, available / 633)
      const margin = 16 * scale
      // topOffset components: margin(16) + topbar height(49) + gap(12) = 77
      // Scale the margin and gap portions; topbar height is handled by TopBar's own scaling
      const scaledTopOffset = margin + 49 * scale + 12 * scale
      toolbarEl.style.transform = `scale(${scale})`
      toolbarEl.style.transformOrigin = 'top left'
      toolbarEl.style.top = `${scaledTopOffset}px`
      toolbarEl.style.left = `${margin}px`
    }
    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  })

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
</script>

<!-- Anchored below TopNavBar: margin + topbar(49) + gap(12) -- positioned dynamically via JS scaling -->
<div bind:this={toolbarEl} class="absolute z-20 sm:z-30
  max-sm:bottom-4 max-sm:left-4 max-sm:right-4 max-sm:flex-row max-sm:justify-around max-sm:rounded-full max-sm:px-2 max-sm:py-2.5 max-sm:gap-0.5
  sm:flex-col sm:w-[75px] sm:rounded-[50px] sm:px-[11px] sm:py-5 sm:justify-between
  flex items-center bg-white/50 backdrop-blur-xl shadow-[0_0_30px_rgba(255,255,255,0.15)] border border-white/20">
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
    onclick={() => {
      unseenBookmarks.set(0)
      activePanel.update(v => v === 'bookmarks' ? null : 'bookmarks')
    }}
  />

  <!-- Divider -->
  <div class="max-sm:my-0 max-sm:mx-1 max-sm:border-l max-sm:h-6 max-sm:self-center max-sm:border-white/10 sm:h-[10px] sm:w-[50px] sm:border-t sm:border-white/20"></div>

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

  <!-- Divider -->
  <div class="max-sm:my-0 max-sm:mx-1 max-sm:border-l max-sm:h-6 max-sm:self-center max-sm:border-white/10 sm:h-[10px] sm:w-[50px] sm:border-t sm:border-white/20"></div>

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
