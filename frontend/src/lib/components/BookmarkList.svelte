<script lang="ts">
  import { bookmarks } from '../stores/bookmarks'
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

<div class="flex flex-col gap-[clamp(6px,0.56vh,8px)]">
  {#if $bookmarks.length === 0}
    <div class="text-center py-8 flex flex-col items-center gap-2">
      <span class="w-8 h-8 text-dtcc-muted/30">{@html Icons.bookmark}</span>
      <p class="text-[13px] text-dtcc-muted">No bookmarks yet</p>
      <p class="text-[12px] text-dtcc-muted/60">Draw an area and save it</p>
    </div>
  {:else}
    {#each $bookmarks as bookmark}
      <div class="flex items-start justify-between px-[var(--atlas-card-padding-x)] py-[var(--atlas-card-padding-y)] rounded-[var(--atlas-control-radius)] border border-black/5 bg-white/30 hover:bg-white/50 transition-colors group">
        <button class="flex-1 text-left cursor-pointer focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none min-w-0" onclick={() => onLoad?.(bookmark)}>
          <div
            class="font-medium text-dtcc-navy truncate"
            style="font-size: var(--atlas-body-text-size); line-height: var(--atlas-body-line-height);"
          >{bookmark.name}</div>
          <div class="mt-0.5">
            <span
              class="text-dtcc-muted"
              style="font-size: var(--atlas-caption-text-size); line-height: var(--atlas-caption-line-height);"
            >{formatArea(bookmark)} km² · {relativeTime(bookmark.createdAt)}</span>
          </div>
        </button>
        <button
          class="p-1 rounded shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none mt-0.5"
          onclick={() => onDelete?.(bookmark.id)}
        >
          {@html Icons.trash}
        </button>
      </div>
    {/each}
  {/if}
</div>
