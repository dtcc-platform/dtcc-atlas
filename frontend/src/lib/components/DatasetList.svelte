<script lang="ts">
  import { datasets, selectedDataset, formConfig } from '../stores/datasets'
  import { activePanel } from '../stores/ui'
  import { bbox } from '../stores/map'
  import { fetchDatasetSchema } from '../api/dataset-api'
  import { schemaParser } from '../forms/schema-parser'
  import type { DatasetInfo } from '../types'

  interface SourceGroup {
    key: string
    label: string
    datasets: DatasetInfo[]
  }

  interface UploadGroup {
    key: string
    label: string
    datasets: DatasetInfo[]
  }

  const SOURCE_ORDER = ['dtcc-core', 'dtcc-sim', 'user-uploaded', 'published', 'other']
  let collapsedGroups: Record<string, boolean> = $state({})

  async function selectDataset(dataset: DatasetInfo) {
    selectedDataset.set(dataset)
    const schema = await fetchDatasetSchema(dataset.name)
    const config = schemaParser.parse(schema, dataset.name)
    formConfig.set(config)
    activePanel.set('dataset-form')
  }

  function sourceGroupKey(dataset: DatasetInfo): string {
    const source = (dataset.source_group || dataset.source || '').toLowerCase()
    if (source === 'dtcc-core') return 'dtcc-core'
    if (source === 'dtcc-sim') return 'dtcc-sim'
    if (source === 'user-uploaded' || source === 'uploaded') return 'user-uploaded'
    if (source === 'published') return 'published'
    if (source.startsWith('dtcc-')) return source
    if (!source) return 'other'
    if (source.includes('upload')) return 'user-uploaded'
    return 'published'
  }

  function sourceGroupLabel(groupKey: string, groupItems: DatasetInfo[]): string {
    if (groupKey === 'dtcc-core') return 'DTCC Core'
    if (groupKey === 'dtcc-sim') return 'DTCC Sim'
    if (groupKey === 'user-uploaded') return 'User Uploads'
    if (groupKey === 'published') return 'Published Datasets'
    const label = groupItems[0]?.source_label || groupItems[0]?.source
    return label || 'Other'
  }

  function groupedBySource(items: DatasetInfo[]): SourceGroup[] {
    const map = new Map<string, DatasetInfo[]>()
    for (const dataset of items) {
      const key = sourceGroupKey(dataset)
      if (!map.has(key)) map.set(key, [])
      map.get(key)?.push(dataset)
    }

    const groups: SourceGroup[] = []
    for (const [key, groupItems] of map.entries()) {
      groups.push({
        key,
        label: sourceGroupLabel(key, groupItems),
        datasets: [...groupItems].sort((a, b) =>
          (a.title || a.name).localeCompare(b.title || b.name),
        ),
      })
    }

    return groups.sort((a, b) => {
      const ai = SOURCE_ORDER.indexOf(a.key)
      const bi = SOURCE_ORDER.indexOf(b.key)
      const av = ai >= 0 ? ai : SOURCE_ORDER.length
      const bv = bi >= 0 ? bi : SOURCE_ORDER.length
      if (av !== bv) return av - bv
      return a.label.localeCompare(b.label)
    })
  }

  function formatUploadGroupLabel(dataset: DatasetInfo): string {
    const name = dataset.upload_name || 'User upload'
    const ts = formatTimestamp(dataset.uploaded_at)
    return ts ? `${name} • ${ts}` : name
  }

  function groupedUploadedByBatch(items: DatasetInfo[]): UploadGroup[] {
    const map = new Map<string, DatasetInfo[]>()
    for (const dataset of items) {
      const key = dataset.upload_batch_id || dataset.upload_name || dataset.uploaded_at || dataset.name
      if (!map.has(key)) map.set(key, [])
      map.get(key)?.push(dataset)
    }

    const groups: UploadGroup[] = []
    for (const [key, groupItems] of map.entries()) {
      groups.push({
        key,
        label: formatUploadGroupLabel(groupItems[0]),
        datasets: [...groupItems].sort((a, b) =>
          (a.title || a.name).localeCompare(b.title || b.name),
        ),
      })
    }

    return groups.sort((a, b) => {
      const at = Date.parse(a.datasets[0]?.uploaded_at || '')
      const bt = Date.parse(b.datasets[0]?.uploaded_at || '')
      if (!Number.isNaN(at) && !Number.isNaN(bt)) return bt - at
      return a.label.localeCompare(b.label)
    })
  }

  function formatTimestamp(value?: string): string {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString([], { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  function sourceDotClass(groupKey: string): string {
    if (groupKey === 'dtcc-core') return 'bg-blue-500'
    if (groupKey === 'dtcc-sim') return 'bg-teal-500'
    if (groupKey === 'user-uploaded') return 'bg-orange-500'
    if (groupKey === 'published') return 'bg-emerald-500'
    return 'bg-gray-500'
  }

  function kindBadgeClass(kind?: string): string {
    if (kind === 'vector') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    if (kind === 'point_cloud') return 'bg-amber-50 text-amber-700 border-amber-200'
    if (kind === 'mesh') return 'bg-rose-50 text-rose-700 border-rose-200'
    if (kind === 'city_model') return 'bg-indigo-50 text-indigo-700 border-indigo-200'
    if (kind === 'raster') return 'bg-sky-50 text-sky-700 border-sky-200'
    return 'bg-gray-50 text-gray-700 border-gray-200'
  }

  function datasetSubtitle(dataset: DatasetInfo): string {
    const bits: string[] = []
    const source = dataset.source_label || dataset.source
    if (source) bits.push(source)
    if (dataset.version !== undefined) bits.push(`v${dataset.version}`)
    if (dataset.supported_formats && dataset.supported_formats.length > 0) {
      bits.push(`formats: ${dataset.supported_formats.join(', ')}`)
    }
    return bits.join(' • ')
  }

  function toBoundsArray(boundsValue: unknown): number[] | null {
    if (!Array.isArray(boundsValue) || boundsValue.length < 4) return null
    const vals = boundsValue.slice(0, 4).map(v => Number(v))
    if (vals.some(v => Number.isNaN(v))) return null
    return vals
  }

  function intersects(a: number[], b: number[]): boolean {
    return !(
      a[2] < b[0] ||
      a[0] > b[2] ||
      a[3] < b[1] ||
      a[1] > b[3]
    )
  }

  type CoverageStatus = 'no-selection' | 'unknown' | 'inside' | 'outside'

  function datasetCoverageStatus(dataset: DatasetInfo): CoverageStatus {
    if (!$bbox) return 'no-selection'
    const datasetBounds = toBoundsArray(dataset.bounds)
    if (!datasetBounds) return 'unknown'
    const queryBounds = [$bbox.minX, $bbox.minY, $bbox.maxX, $bbox.maxY]
    return intersects(datasetBounds, queryBounds) ? 'inside' : 'outside'
  }

  function coverageBadgeClass(status: CoverageStatus): string {
    if (status === 'inside') return 'bg-green-50 text-green-700 border-green-200'
    if (status === 'outside') return 'bg-red-50 text-red-700 border-red-200'
    if (status === 'unknown') return 'bg-gray-50 text-gray-700 border-gray-200'
    return 'bg-slate-50 text-slate-600 border-slate-200'
  }

  function coverageLabel(status: CoverageStatus): string {
    if (status === 'inside') return 'Has data in selection'
    if (status === 'outside') return 'Outside selection'
    if (status === 'unknown') return 'Coverage unknown'
    return 'No selection'
  }

  function isCollapsed(groupKey: string): boolean {
    return collapsedGroups[groupKey] ?? false
  }

  function toggleCollapsed(groupKey: string) {
    collapsedGroups = {
      ...collapsedGroups,
      [groupKey]: !isCollapsed(groupKey),
    }
  }
</script>

<div class="p-5 h-full flex flex-col min-h-0">
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-[16px] font-semibold text-[#1a1a2e]">Select Dataset</h3>
    <span class="text-[12px] text-[#6b7280]">{$datasets.length} available</span>
  </div>
  <div class="min-h-0 flex-1 overflow-y-auto pr-1 flex flex-col gap-3">
    {#if !$datasets.length}
      <div class="text-[12px] text-[#6b7280] p-3 border border-[#e5e7eb] rounded-lg">
        No datasets found. Try uploading data, then reopen this panel to refresh.
      </div>
    {:else}
      {@const sourceGroups = groupedBySource($datasets)}
      {@const nonUploadGroups = sourceGroups.filter((g) => g.key !== 'user-uploaded')}
      {@const uploadedDatasets = sourceGroups.find((g) => g.key === 'user-uploaded')?.datasets ?? []}
      {@const uploadGroups = groupedUploadedByBatch(uploadedDatasets)}

      {#each nonUploadGroups as group}
        {@const groupStateKey = `source:${group.key}`}
        <section class="border border-[#ececf1] rounded-xl overflow-hidden flex flex-col min-h-0">
          <button
            class="w-full px-3 py-2 bg-[#f8f9fb] border-b border-[#ececf1] flex items-center justify-between text-left hover:bg-[#f2f4f8] transition-colors cursor-pointer"
            onclick={() => toggleCollapsed(groupStateKey)}
          >
            <div class="flex items-center gap-2">
              <span class={`w-2 h-2 rounded-full ${sourceDotClass(group.key)}`}></span>
              <h4 class="text-[12px] font-semibold text-[#1f2937] uppercase tracking-wide">{group.label}</h4>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[11px] text-[#6b7280]">{group.datasets.length}</span>
              <span class="text-[12px] text-[#6b7280]">{isCollapsed(groupStateKey) ? '▸' : '▾'}</span>
            </div>
          </button>
          {#if !isCollapsed(groupStateKey)}
            <div class="p-2 flex flex-col gap-1 max-h-[44vh] overflow-y-auto">
              {#each group.datasets as dataset, idx}
                {@const coverage = datasetCoverageStatus(dataset)}
                <button
                  class={`w-full flex items-start justify-between px-3 py-3 rounded-lg text-left hover:bg-black/5 transition-colors group cursor-pointer ${idx % 2 === 1 ? 'bg-[#f6f7f9]' : 'bg-white'}`}
                  onclick={() => selectDataset(dataset)}
                >
                  <div class="min-w-0">
                    <div class="text-[13px] font-medium text-[#1a1a2e] truncate">{dataset.title || dataset.name}</div>
                    <div class="mt-1 flex items-center gap-2 flex-wrap">
                      <span class={`text-[10px] px-2 py-0.5 rounded border ${kindBadgeClass(dataset.data_kind)}`}>
                        {dataset.data_kind_label || 'Unknown'}
                      </span>
                      <span class={`text-[10px] px-2 py-0.5 rounded border ${coverageBadgeClass(coverage)}`}>
                        {coverageLabel(coverage)}
                      </span>
                      <span class="text-[11px] text-[#6b7280] truncate">{datasetSubtitle(dataset)}</span>
                    </div>
                  </div>
                  <span class="text-[#6b7280] opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">&rarr;</span>
                </button>
              {/each}
            </div>
          {/if}
        </section>
      {/each}

      {#if uploadGroups.length > 0}
        <div class="mt-1 border-t border-[#e5e7eb] pt-3">
          <h4 class="text-[12px] font-semibold text-[#7c4a2f] uppercase tracking-wide px-1">
            User Uploads
          </h4>
        </div>

        {#each uploadGroups as uploadGroup}
          {@const uploadStateKey = `upload:${uploadGroup.key}`}
          <section class="border border-[#f0e4da] rounded-xl overflow-hidden flex flex-col min-h-0">
            <button
              class="w-full px-3 py-2 bg-[#fff8f4] border-b border-[#f1e6dc] flex items-center justify-between text-left hover:bg-[#fff0e6] transition-colors cursor-pointer"
              onclick={() => toggleCollapsed(uploadStateKey)}
            >
              <div class="flex items-center gap-2">
                <span class={`w-2 h-2 rounded-full ${sourceDotClass('user-uploaded')}`}></span>
                <h4 class="text-[12px] font-semibold text-[#7c4a2f] tracking-wide">{uploadGroup.label}</h4>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-[11px] text-[#8b5b3c]">{uploadGroup.datasets.length}</span>
                <span class="text-[12px] text-[#8b5b3c]">{isCollapsed(uploadStateKey) ? '▸' : '▾'}</span>
              </div>
            </button>
            {#if !isCollapsed(uploadStateKey)}
              <div class="p-2 flex flex-col gap-1 max-h-[44vh] overflow-y-auto">
                {#each uploadGroup.datasets as dataset, idx}
                  {@const coverage = datasetCoverageStatus(dataset)}
                  <button
                    class={`w-full flex items-start justify-between px-3 py-3 rounded-lg text-left hover:bg-black/5 transition-colors group cursor-pointer ${idx % 2 === 1 ? 'bg-[#f6f7f9]' : 'bg-white'}`}
                    onclick={() => selectDataset(dataset)}
                  >
                    <div class="min-w-0">
                      <div class="text-[13px] font-medium text-[#1a1a2e] truncate">{dataset.title || dataset.name}</div>
                      <div class="mt-1 flex items-center gap-2 flex-wrap">
                        <span class={`text-[10px] px-2 py-0.5 rounded border ${kindBadgeClass(dataset.data_kind)}`}>
                          {dataset.data_kind_label || 'Unknown'}
                        </span>
                        <span class={`text-[10px] px-2 py-0.5 rounded border ${coverageBadgeClass(coverage)}`}>
                          {coverageLabel(coverage)}
                        </span>
                        <span class="text-[11px] text-[#6b7280] truncate">{datasetSubtitle(dataset)}</span>
                      </div>
                    </div>
                    <span class="text-[#6b7280] opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">&rarr;</span>
                  </button>
                {/each}
              </div>
            {/if}
          </section>
        {/each}
      {/if}
    {/if}
  </div>
</div>
