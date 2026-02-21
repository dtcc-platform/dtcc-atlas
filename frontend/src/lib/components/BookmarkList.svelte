<script lang="ts">
  import { bookmarks } from '../stores/bookmarks'
  import { activePanel } from '../stores/ui'
  import { Icons } from '../ui/icons'
  import type { SavedBookmark } from '../types/bookmarks'

  interface Props {
    onLoad?: (bookmark: SavedBookmark) => void
    onDelete?: (id: string) => void
  }

  let { onLoad, onDelete }: Props = $props()

  function formatArea(b: SavedBookmark): string {
    const dx = b.bbox.maxX - b.bbox.minX
    const dy = b.bbox.maxY - b.bbox.minY
    return ((dx * dy) / 1_000_000).toFixed(2)
  }

  function relativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp
    const minutes = Math.floor(diff / 60000)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }
</script>

<div class="p-5">
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-[16px] font-semibold text-[#1a1a2e]">Bookmarks</h3>
    <button class="p-1 rounded hover:bg-black/5 cursor-pointer" onclick={() => activePanel.set(null)}>
      {@html Icons.close}
    </button>
  </div>

  {#if $bookmarks.length === 0}
    <div class="text-center py-8">
      <p class="text-[13px] text-[#6b7280]">No bookmarks yet</p>
      <p class="text-[12px] text-[#6b7280]/60 mt-1">Draw an area and save it</p>
    </div>
  {:else}
    <div class="flex flex-col gap-1">
      {#each $bookmarks as bookmark}
        <div class="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 group">
          <button class="flex-1 text-left cursor-pointer" onclick={() => onLoad?.(bookmark)}>
            <div class="text-[13px] text-[#1a1a2e] font-medium">{bookmark.name}</div>
            <div class="text-[11px] text-[#6b7280]">{formatArea(bookmark)} km² · {relativeTime(bookmark.createdAt)}</div>
          </button>
          <button
            class="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all cursor-pointer"
            onclick={() => onDelete?.(bookmark.id)}
          >
            {@html Icons.trash}
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>
