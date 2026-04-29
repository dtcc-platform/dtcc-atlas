<script lang="ts">
  import { datasets, selectedDataset, formConfig } from '../stores/datasets'
  import { activePanel, collapsedPanels, togglePanelCollapsed } from '../stores/ui'
  import { fetchDatasetSchema } from '../api/dataset-api'
  import { schemaParser } from '../forms/schema-parser'
  import FloatingPanel from './FloatingPanel.svelte'
  import type { DatasetInfo } from '../types'

  type CategoryKey = 'dtcc-core' | 'user-uploaded'

  interface Category {
    key: CategoryKey
    label: string
    datasets: DatasetInfo[]
  }

  const CATEGORY_META: { key: CategoryKey; label: string }[] = [
    { key: 'dtcc-core', label: 'DTCC Core' },
    { key: 'user-uploaded', label: 'User Uploads' },
  ]

  function sourceGroupKey(dataset: DatasetInfo): CategoryKey {
    const source = (dataset.source_group || dataset.source || '').toLowerCase()
    if (source === 'dtcc-core') return 'dtcc-core'
    if (source === 'dtcc-sim') return 'dtcc-sim'
    if (source === 'user-uploaded' || source === 'uploaded') return 'user-uploaded'
    if (source.includes('upload')) return 'user-uploaded'
    return 'dtcc-core'
  }

  // Group datasets into categories, only include non-empty ones
  // Filter out dtcc-sim datasets (they appear in Simulations panel instead)
  const activeCategories = $derived.by(() => {
    const map = new Map<CategoryKey, DatasetInfo[]>()
    for (const d of $datasets) {
      const source = (d.source_group || d.source || '').toLowerCase()
      // Skip dtcc-sim datasets — they're shown in the Simulations panel
      if (source === 'dtcc-sim') continue

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
  const stackRows = $derived(Math.max(activeCategories.length, 1))

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
    if (dataset.version !== undefined) bits.push(`v${dataset.version}`)
    if (dataset.supported_formats && dataset.supported_formats.length > 0) {
      bits.push(`formats: ${dataset.supported_formats.join(', ')}`)
    }
    return bits.join(' \u2022 ')
  }

  function panelIdForCategory(key: string) {
    return `datasets:${key}`
  }
</script>

<!-- Dataset panel stack: 1-3 floating panels stacked vertically -->
<div
  class="fixed z-30
    max-sm:inset-0
    sm:w-[var(--atlas-panel-width)]
    grid gap-[var(--atlas-panel-gap)]
    animate-panel-in"
  style={`top: var(--atlas-layout-top); right: var(--atlas-edge-gap); height: var(--atlas-toolbar-natural-height); grid-template-rows: repeat(${stackRows}, minmax(0, 1fr));`}
>
  {#if showEmpty}
    <div class="relative min-h-0">
      <FloatingPanel
        title="Datasets"
        panelId="datasets:empty"
        collapsed={Boolean($collapsedPanels['datasets:empty'])}
        onToggleCollapsed={() => togglePanelCollapsed('datasets:empty')}
        onClose={handleClose}
        class={Boolean($collapsedPanels['datasets:empty']) ? 'absolute top-0 left-0 right-0 h-[var(--atlas-panel-collapsed-height)]' : 'absolute inset-0'}
      >
        <div class="flex items-center justify-center h-full text-center">
          <p class="text-sm text-dtcc-muted">No datasets found. Try uploading data, then reopen this panel.</p>
        </div>
      </FloatingPanel>
    </div>
  {:else}
    <!-- One panel per non-empty dataset category -->
    {#each activeCategories as cat, index (cat.key)}
      {@const panelId = panelIdForCategory(cat.key)}
      {@const isColl = Boolean($collapsedPanels[panelId])}
      <div class="relative min-h-0">
        <FloatingPanel
          title={cat.label}
          panelId={panelId}
          collapsed={isColl}
          onToggleCollapsed={() => togglePanelCollapsed(panelId)}
          onClose={index === 0 ? handleClose : undefined}
          class={isColl ? 'absolute top-0 left-0 right-0 self-start' : 'absolute inset-0'}
        >
          <div class="flex flex-col gap-[clamp(6px,0.56vh,8px)]">
            {#each cat.datasets as dataset (dataset.name)}
              <button
                class="w-full flex items-start justify-between px-[var(--atlas-card-padding-x)] py-[var(--atlas-card-padding-y)] rounded-[var(--atlas-control-radius)] border border-black/5 text-left
                  bg-white/30 hover:bg-white/50 transition-colors group cursor-pointer
                  focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
                onclick={() => selectDataset(dataset)}
              >
                <div class="min-w-0">
                  <div
                    class="font-medium text-dtcc-navy truncate"
                    style="font-size: var(--atlas-body-text-size); line-height: var(--atlas-body-line-height);"
                  >
                    {dataset.title || dataset.name}
                  </div>
                  <div class="mt-0.5">
                    <span
                      class="text-dtcc-muted truncate"
                      style="font-size: var(--atlas-caption-text-size); line-height: var(--atlas-caption-line-height);"
                    >
                      {datasetSubtitle(dataset)}
                    </span>
                  </div>
                </div>
                <span class="text-dtcc-muted opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">&rarr;</span>
              </button>
            {/each}
          </div>
        </FloatingPanel>
      </div>
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
