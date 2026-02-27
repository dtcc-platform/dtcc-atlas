<script lang="ts">
  import { get } from 'svelte/store'
  import ToolbarButton from './ToolbarButton.svelte'
  import { Icons } from '../ui/icons'
  import { fetchDatasetList } from '../api/dataset-api'
  import { datasets } from '../stores/datasets'
  import { drawingActive, activePanel, searchOpen } from '../stores/ui'
  import { bbox } from '../stores/map'
  import { bookmarkCount } from '../stores/bookmarks'
  import { activeJobCount } from '../stores/jobs'

  interface Props {
    onClear?: () => void
    onSave?: () => void
    onToggle3D?: () => void
  }

  let { onClear, onSave, onToggle3D }: Props = $props()

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
  max-sm:bottom-4 max-sm:left-4 max-sm:right-4 max-sm:flex-row max-sm:justify-around max-sm:rounded-2xl
  sm:top-4 sm:left-4 sm:flex-col
  flex bg-white/80 backdrop-blur-lg rounded-xl shadow-lg border border-black/5 p-1 gap-0.5">
  <!-- Actions group -->
  <ToolbarButton
    icon={Icons.draw}
    label="Draw area"
    active={$drawingActive}
    onclick={() => drawingActive.update(v => !v)}
  />
  <ToolbarButton
    icon={Icons.clear}
    label="Clear"
    disabled={!$bbox}
    onclick={onClear}
  />
  <ToolbarButton
    icon={Icons.bookmark}
    label="Save bookmark"
    disabled={!$bbox}
    onclick={onSave}
  />

  <!-- Divider -->
  <div class="sm:mx-2 sm:my-1 sm:border-t max-sm:my-0 max-sm:mx-1 max-sm:border-l max-sm:h-6 max-sm:self-center border-black/10"></div>

  <!-- Views group -->
  <ToolbarButton
    icon={Icons.list}
    label="Bookmarks"
    active={$activePanel === 'bookmarks'}
    badge={$bookmarkCount > 0}
    onclick={() => activePanel.update(v => v === 'bookmarks' ? null : 'bookmarks')}
  />
  <ToolbarButton
    icon={Icons.download}
    label="Datasets"
    active={$activePanel === 'datasets' || $activePanel === 'dataset-form'}
    badge={$activeJobCount > 0}
    onclick={toggleDatasetsPanel}
  />
  <ToolbarButton
    icon={Icons.upload}
    label="Uploads"
    active={$activePanel === 'uploads'}
    onclick={() => activePanel.update(v => v === 'uploads' ? null : 'uploads')}
  />

  <!-- Divider -->
  <div class="sm:mx-2 sm:my-1 sm:border-t max-sm:my-0 max-sm:mx-1 max-sm:border-l max-sm:h-6 max-sm:self-center border-black/10"></div>

  <!-- Tools group -->
  <ToolbarButton
    icon={Icons.search}
    label="Search"
    active={$searchOpen}
    onclick={() => searchOpen.update(v => !v)}
  />
  <ToolbarButton
    icon={Icons.view3d}
    label="3D view"
    onclick={onToggle3D}
  />
</div>
