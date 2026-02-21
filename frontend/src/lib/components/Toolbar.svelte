<script lang="ts">
  import ToolbarButton from './ToolbarButton.svelte'
  import { Icons } from '../ui/icons'
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
</script>

<div class="absolute top-4 left-4 z-40 flex flex-col bg-white/80 backdrop-blur-lg rounded-xl shadow-lg border border-black/5 p-1 gap-0.5">
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
  <div class="mx-2 my-1 border-t border-black/10"></div>

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
    onclick={() => activePanel.update(v => v === 'datasets' ? null : 'datasets')}
  />

  <!-- Divider -->
  <div class="mx-2 my-1 border-t border-black/10"></div>

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
