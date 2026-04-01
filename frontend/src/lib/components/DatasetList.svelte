<script lang="ts">
  import { datasets, selectedDataset, formConfig } from '../stores/datasets'
  import { activePanel } from '../stores/ui'
  import { bbox } from '../stores/map'
  import { fetchDatasetSchema } from '../api/dataset-api'
  import { schemaParser } from '../forms/schema-parser'
  import FloatingPanel from './FloatingPanel.svelte'
  import type { DatasetInfo } from '../types'

  type CategoryKey = 'dtcc-core' | 'dtcc-sim' | 'user-uploaded'

  interface Category {
    key: CategoryKey
    label: string
    datasets: DatasetInfo[]
  }

  const CATEGORY_META: { key: CategoryKey; label: string }[] = [
    { key: 'dtcc-core', label: 'DTCC Core' },
    { key: 'dtcc-sim', label: 'DTCC Sim' },
    { key: 'user-uploaded', label: 'User Uploads' },
  ]

  let stackEl: HTMLElement

  function sourceGroupKey(dataset: DatasetInfo): CategoryKey {
    const source = (dataset.source_group || dataset.source || '').toLowerCase()
    if (source === 'dtcc-core') return 'dtcc-core'
    if (source === 'dtcc-sim') return 'dtcc-sim'
    if (source === 'user-uploaded' || source === 'uploaded') return 'user-uploaded'
    if (source.includes('upload')) return 'user-uploaded'
    return 'dtcc-core'
  }

  // Group datasets into categories, only include non-empty ones
  const activeCategories = $derived.by(() => {
    const map = new Map<CategoryKey, DatasetInfo[]>()
    for (const d of $datasets) {
      const key = sourceGroupKey(d)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(d)
    }
    const result: Category[] = []
    for (const meta of CATEGORY_META) {
      const items = map.get(meta.key)
      if (items && items.length > 0) {
        result.push({
          key: meta.key,
          label: meta.label,
          datasets: items.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name)),
        })
      }
    }
    return result
  })

  // When no datasets at all, show a single empty panel
  const showEmpty = $derived($datasets.length === 0)

  async function selectDataset(dataset: DatasetInfo) {
    selectedDataset.set(dataset)
    const schema = await fetchDatasetSchema(dataset.name)
    const config = schemaParser.parse(schema, dataset.name)
    formConfig.set(config)
    activePanel.set('dataset-form')
  }

  function handleClose() {
    activePanel.set(null)
  }

  function datasetSubtitle(dataset: DatasetInfo): string {
    const bits: string[] = []
    const source = dataset.source_label || dataset.source
    if (source) bits.push(source)
    if (dataset.version !== undefined) bits.push(`v${dataset.version}`)
    if (dataset.supported_formats && dataset.supported_formats.length > 0) {
      bits.push(`formats: ${dataset.supported_formats.join(', ')}`)
    }
    return bits.join(' \u2022 ')
  }

  // Responsive scaling: same mechanism as Toolbar.svelte
  $effect(() => {
    if (!stackEl) return
    function updateScale() {
      const topOffset = 77
      const bottomMargin = 16
      const available = window.innerHeight - topOffset - bottomMargin
      const scale = Math.min(1, available / 633)
      const margin = 16 * scale
      const scaledTopOffset = margin + 49 * scale + 12 * scale
      stackEl.style.transform = `scale(${scale})`
      stackEl.style.transformOrigin = 'top right'
      stackEl.style.top = `${scaledTopOffset}px`
      stackEl.style.right = `${margin}px`
    }
    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  })
</script>

<!-- Dataset panel stack: 1-3 floating panels stacked vertically -->
<div
  bind:this={stackEl}
  class="absolute z-30
    max-sm:inset-0
    sm:w-[360px]
    flex flex-col gap-3
    animate-panel-in"
  style="top: 77px; right: 16px; max-height: calc(100vh - 160px);"
>
  {#if showEmpty}
    <!-- Single empty panel when no datasets -->
    <FloatingPanel title="Datasets" onClose={handleClose} class="min-h-[200px]">
      <div class="flex items-center justify-center h-full">
        <p class="text-sm text-dtcc-muted">No datasets found. Try uploading data, then reopen this panel.</p>
      </div>
    </FloatingPanel>
  {:else}
    <!-- One panel per non-empty dataset category -->
    {#each activeCategories as cat (cat.key)}
      <FloatingPanel
        title={cat.label}
        onClose={handleClose}
        class="shrink min-h-[120px]"
      >
        <div class="flex flex-col gap-1">
          {#each cat.datasets as dataset (dataset.name)}
            <button
              class="w-full flex items-start justify-between px-3 py-3 rounded-xl text-left
                bg-white/30 hover:bg-white/50 transition-colors group cursor-pointer
                focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
              onclick={() => selectDataset(dataset)}
            >
              <div class="min-w-0">
                <div class="text-[13px] font-medium text-dtcc-navy truncate">{dataset.title || dataset.name}</div>
                <div class="mt-0.5">
                  <span class="text-[11px] text-dtcc-muted truncate">{datasetSubtitle(dataset)}</span>
                </div>
              </div>
              <span class="text-dtcc-muted opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">&rarr;</span>
            </button>
          {/each}
        </div>
      </FloatingPanel>
    {/each}
  {/if}
</div>

<style>
  @keyframes panel-in {
    from { opacity: 0; transform: translateX(8px); }
    to { opacity: 1; transform: translateX(0); }
  }
  .animate-panel-in {
    animation: panel-in 200ms ease-out;
  }
</style>
