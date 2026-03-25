<script lang="ts">
  import { get } from 'svelte/store'
  import ToolbarButton from './ToolbarButton.svelte'
  import { Icons } from '../ui/icons'
  import { fetchDatasetList } from '../api/dataset-api'
  import { datasets } from '../stores/datasets'
  import { drawingActive, activePanel, searchOpen, is3D, hasUnseenBookmarks, hasUnseenDatasets, hasUnseenLayers } from '../stores/ui'
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
</script>

<div class="absolute z-20 sm:z-40
  max-sm:bottom-4 max-sm:left-4 max-sm:right-4 max-sm:flex-row max-sm:justify-around max-sm:rounded-full
  sm:top-4 sm:left-4 sm:flex-col
  flex items-center bg-white/10 backdrop-blur-xl rounded-full shadow-[0_0_30px_rgba(255,255,255,0.15)] border border-white/20 px-2 py-2.5 gap-0.5">
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
    disabled={!$bbox}
    onclick={onClear}
  />
  <ToolbarButton
    icon={Icons.bookmark}
    label="Bookmarks"
    active={$activePanel === 'bookmarks'}
    badge={$hasUnseenBookmarks}
    onclick={() => {
      hasUnseenBookmarks.set(false)
      activePanel.update(v => v === 'bookmarks' ? null : 'bookmarks')
    }}
  />

  <!-- Divider -->
  <div class="sm:mx-2 sm:my-1.5 sm:border-t max-sm:my-0 max-sm:mx-1 max-sm:border-l max-sm:h-6 max-sm:self-center border-white/10 sm:w-full"></div>

  <!-- Data group -->
  <ToolbarButton
    icon={Icons.dataTree}
    label="Datasets"
    active={$activePanel === 'datasets' || $activePanel === 'dataset-form'}
    badge={$hasUnseenDatasets}
    onclick={() => {
      hasUnseenDatasets.set(false)
      toggleDatasetsPanel()
    }}
  />
  <ToolbarButton
    icon={Icons.layers}
    label="Layers"
    active={$activePanel === 'layers'}
    badge={$hasUnseenLayers}
    onclick={() => {
      hasUnseenLayers.set(false)
      activePanel.update(v => v === 'layers' ? null : 'layers')
    }}
  />
  <ToolbarButton
    icon={Icons.download}
    label="Download"
    active={$activePanel === 'downloads'}
    onclick={() => activePanel.update(v => v === 'downloads' ? null : 'downloads')}
  />
  <ToolbarButton
    icon={Icons.upload}
    label="Upload"
    active={$activePanel === 'uploads'}
    onclick={() => activePanel.update(v => v === 'uploads' ? null : 'uploads')}
  />

  <!-- Divider -->
  <div class="sm:mx-2 sm:my-1.5 sm:border-t max-sm:my-0 max-sm:mx-1 max-sm:border-l max-sm:h-6 max-sm:self-center border-white/10 sm:w-full"></div>

  <!-- Tools group -->
  <ToolbarButton
    icon={Icons.search}
    label="Search"
    active={$searchOpen}
    onclick={() => searchOpen.update(v => !v)}
  />
  <ToolbarButton
    icon={Icons.chat}
    label="Chat"
    active={$activePanel === 'chat'}
    onclick={() => activePanel.update(v => v === 'chat' ? null : 'chat')}
  />
  <ToolbarButton
    icon={$is3D ? Icons.view2d : Icons.view3d}
    label={$is3D ? '2D view' : '3D view'}
    active={$is3D}
    onclick={onToggle3D}
  />
</div>
