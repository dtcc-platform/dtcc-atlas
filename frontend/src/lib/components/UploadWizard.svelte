<script lang="ts">
  import { activePanel } from '../stores/ui'
  import { datasets } from '../stores/datasets'
  import { Icons } from '../ui/icons'
  import { fetchDatasetList } from '../api/dataset-api'
  import {
    createUploadBatch,
    ingestUploadBatch,
    type UploadCandidate,
    type UploadBatchProgress,
    type IngestCandidateOverride,
  } from '../api/upload-api'

  type Step = 'select' | 'review' | 'ingesting' | 'complete'

  let step: Step = $state('select')
  let selectedFiles: File[] = $state([])
  let batchId: string | null = $state(null)
  let candidates: UploadCandidate[] = $state([])
  let errorMessage: string = $state('')
  let loading = $state(false)
  let ingestResult: { ingested_count: number; failed_count: number } | null = $state(null)
  let uploadBatchName = $state(defaultUploadName())
  let scanProgress: UploadBatchProgress = $state({
    phase: 'uploading',
    bytesSent: 0,
    bytesTotal: 0,
    percent: 0,
    message: '',
  })

  type CandidateEdit = { keep: boolean; dataset_name: string; role: string; crs: string }
  let edits: Record<string, CandidateEdit> = $state({})

  function fileKey(file: File): string {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    return `${relative}:${file.size}:${file.lastModified}`
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) return
    const map = new Map<string, File>()
    for (const f of selectedFiles) {
      map.set(fileKey(f), f)
    }
    for (const f of Array.from(fileList)) {
      map.set(fileKey(f), f)
    }
    selectedFiles = Array.from(map.values())
  }

  function onFilesSelected(e: Event) {
    const target = e.target as HTMLInputElement
    addFiles(target.files)
    target.value = ''
  }

  function initializeEdits(list: UploadCandidate[]) {
    const next: Record<string, CandidateEdit> = {}
    for (const c of list) {
      next[c.id] = {
        keep: true,
        dataset_name: c.name,
        role: c.role,
        crs: String(c.metadata?.crs ?? ''),
      }
    }
    edits = next
  }

  async function scanFiles() {
    if (!selectedFiles.length) {
      errorMessage = 'Select files or a folder first.'
      return
    }
    loading = true
    errorMessage = ''
    scanProgress = {
      phase: 'uploading',
      bytesSent: 0,
      bytesTotal: selectedFiles.reduce((sum, file) => sum + file.size, 0),
      percent: 0,
      message: 'Preparing upload...',
    }
    try {
      const resp = await createUploadBatch(selectedFiles, uploadBatchName, (progress) => {
        scanProgress = progress
      })
      batchId = resp.batch_id
      candidates = resp.candidates
      initializeEdits(resp.candidates)
      step = 'review'
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'Failed to scan files'
    } finally {
      loading = false
    }
  }

  async function ingest() {
    if (!batchId) return
    step = 'ingesting'
    errorMessage = ''

    const payload: IngestCandidateOverride[] = candidates.map((c) => {
      const edit = edits[c.id]
      return {
        candidate_id: c.id,
        keep: edit?.keep ?? true,
        dataset_name: edit?.dataset_name,
        role: edit?.role,
        crs: edit?.crs || undefined,
      }
    })

    try {
      const resp = await ingestUploadBatch(batchId, payload)
      ingestResult = {
        ingested_count: resp.ingested_count,
        failed_count: resp.failed_count,
      }
      const list = await fetchDatasetList()
      datasets.set(list)
      step = 'complete'
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'Ingestion failed'
      step = 'review'
    }
  }

  function resetWizard() {
    step = 'select'
    selectedFiles = []
    batchId = null
    candidates = []
    edits = {}
    uploadBatchName = defaultUploadName()
    ingestResult = null
    errorMessage = ''
    scanProgress = {
      phase: 'uploading',
      bytesSent: 0,
      bytesTotal: 0,
      percent: 0,
      message: '',
    }
  }

  function formatBytes(bytes: number): string {
    if (!bytes) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let value = bytes
    let idx = 0
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024
      idx += 1
    }
    return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`
  }

  function defaultUploadName(): string {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `Upload ${yyyy}-${mm}-${dd} ${hh}:${min}`
  }
</script>

<div class="p-5">
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-[16px] font-semibold text-[#1a1a2e]">Upload Data</h3>
    <button class="p-1 rounded hover:bg-black/5 cursor-pointer" onclick={() => activePanel.set(null)}>
      {@html Icons.close}
    </button>
  </div>

  {#if step === 'select'}
    <div class="flex flex-col gap-3">
      <p class="text-[12px] text-[#6b7280]">
        Add files or a folder. Atlas will detect candidate datasets procedurally.
      </p>

      <div class="rounded-lg border-2 border-dashed border-[#d1d5db] bg-[#f9fafb] p-4">
        <label class="block mb-3">
          <span class="block text-[12px] text-[#6b7280] mb-1">Upload name</span>
          <input
            class="h-8 w-full px-2 rounded border border-[#e5e7eb] text-[12px] bg-white"
            bind:value={uploadBatchName}
            placeholder="Upload 2026-02-26 14:30"
          />
        </label>
        <div class="flex gap-2">
          <label class="px-3 py-2 rounded-lg bg-white border border-[#e5e7eb] text-[12px] cursor-pointer hover:bg-black/5">
            Add files
            <input type="file" multiple class="hidden" onchange={onFilesSelected} />
          </label>
          <label class="px-3 py-2 rounded-lg bg-white border border-[#e5e7eb] text-[12px] cursor-pointer hover:bg-black/5">
            Add folder
            <input type="file" multiple webkitdirectory directory class="hidden" onchange={onFilesSelected} />
          </label>
        </div>
        <p class="mt-3 text-[12px] text-[#6b7280]">
          {selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'} selected
        </p>
      </div>

      <button
        class="h-10 rounded-lg text-[13px] font-medium transition-colors cursor-pointer
          {loading || !selectedFiles.length
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-[#1a1a2e] text-white hover:bg-[#2d2d44]'}"
        disabled={loading || !selectedFiles.length}
        onclick={scanFiles}
      >
        {loading ? 'Scanning...' : 'Scan files'}
      </button>

      {#if loading}
        <div class="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-3">
          <div class="flex items-center justify-between text-[11px] text-[#6b7280] mb-1">
            <span>{scanProgress.phase === 'uploading' ? 'Upload progress' : 'Server scan'}</span>
            <span>{scanProgress.percent.toFixed(1)}%</span>
          </div>
          <div class="h-2 bg-white border border-[#e5e7eb] rounded overflow-hidden">
            <div class="h-full bg-[#e35a1d] transition-all duration-200" style={`width: ${scanProgress.percent}%`}></div>
          </div>
          <p class="mt-2 text-[12px] text-[#374151]">{scanProgress.message || 'Working...'}</p>
          {#if scanProgress.bytesTotal > 0}
            <p class="mt-1 text-[11px] text-[#6b7280]">
              {formatBytes(scanProgress.bytesSent)} / {formatBytes(scanProgress.bytesTotal)}
            </p>
          {/if}
        </div>
      {/if}
    </div>
  {:else if step === 'review'}
    <div class="flex flex-col gap-3">
      <p class="text-[12px] text-[#6b7280]">
        Review detected candidates and adjust name, role, or CRS before ingestion.
      </p>
      <div class="max-h-[420px] overflow-y-auto border border-[#e5e7eb] rounded-lg">
        {#each candidates as candidate}
          <div class="p-3 border-b border-[#f0f0f0] last:border-b-0">
            <div class="flex items-center justify-between gap-2 mb-2">
              <div class="text-[13px] font-medium text-[#1a1a2e]">{candidate.title}</div>
              <label class="text-[12px] text-[#6b7280] flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={edits[candidate.id]?.keep ?? true}
                  onchange={(e) => edits = { ...edits, [candidate.id]: { ...edits[candidate.id], keep: (e.target as HTMLInputElement).checked } }}
                />
                Keep
              </label>
            </div>

            <div class="grid grid-cols-1 gap-2">
              <input
                class="h-8 px-2 rounded border border-[#e5e7eb] text-[12px]"
                value={edits[candidate.id]?.dataset_name ?? candidate.name}
                oninput={(e) => edits = { ...edits, [candidate.id]: { ...edits[candidate.id], dataset_name: (e.target as HTMLInputElement).value } }}
                placeholder="Dataset name"
              />
              <select
                class="h-8 px-2 rounded border border-[#e5e7eb] text-[12px] bg-white"
                value={edits[candidate.id]?.role ?? candidate.role}
                onchange={(e) => edits = { ...edits, [candidate.id]: { ...edits[candidate.id], role: (e.target as HTMLSelectElement).value } }}
              >
                <option value="point-cloud-source">Point cloud source</option>
                <option value="terrain-raster">Terrain raster</option>
                <option value="generic-vector">Generic vector</option>
                <option value="mesh">Mesh</option>
                <option value="city-model">City model</option>
                <option value="unknown">Unknown</option>
              </select>
              <input
                class="h-8 px-2 rounded border border-[#e5e7eb] text-[12px]"
                value={edits[candidate.id]?.crs ?? ''}
                oninput={(e) => edits = { ...edits, [candidate.id]: { ...edits[candidate.id], crs: (e.target as HTMLInputElement).value } }}
                placeholder="CRS override (optional)"
              />
            </div>

            <div class="mt-2 text-[11px] text-[#6b7280]">
              Type: {candidate.inferred_type} • Confidence: {candidate.confidence}
            </div>
            {#if candidate.warnings?.length}
              <div class="mt-1 text-[11px] text-orange-600">
                {candidate.warnings.join(' | ')}
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <div class="flex gap-2">
        <button
          class="h-9 px-3 rounded-lg border border-[#e5e7eb] text-[12px] hover:bg-black/5 cursor-pointer"
          onclick={resetWizard}
        >
          Start over
        </button>
        <button
          class="h-9 flex-1 rounded-lg text-[13px] font-medium bg-[#1a1a2e] text-white hover:bg-[#2d2d44] cursor-pointer"
          onclick={ingest}
        >
          Ingest selected
        </button>
      </div>
    </div>
  {:else if step === 'ingesting'}
    <div class="py-8 text-center">
      <div class="w-8 h-8 mx-auto border-2 border-[#e35a1d] border-t-transparent rounded-full animate-spin"></div>
      <p class="mt-3 text-[13px] text-[#1a1a2e]">Ingesting datasets...</p>
      <p class="text-[12px] text-[#6b7280]">Normalizing files and registering catalog entries</p>
    </div>
  {:else if step === 'complete'}
    <div class="flex flex-col gap-3">
      <div class="p-3 rounded-lg bg-green-50 text-green-700 text-[12px]">
        Ingestion completed.
      </div>
      <p class="text-[12px] text-[#6b7280]">
        {ingestResult?.ingested_count ?? 0} ingested, {ingestResult?.failed_count ?? 0} failed.
      </p>
      <div class="flex gap-2">
        <button
          class="h-9 px-3 rounded-lg border border-[#e5e7eb] text-[12px] hover:bg-black/5 cursor-pointer"
          onclick={resetWizard}
        >
          Upload more
        </button>
        <button
          class="h-9 flex-1 rounded-lg text-[13px] font-medium bg-[#1a1a2e] text-white hover:bg-[#2d2d44] cursor-pointer"
          onclick={() => activePanel.set('datasets')}
        >
          Open datasets
        </button>
      </div>
    </div>
  {/if}

  {#if errorMessage}
    <div class="mt-3 text-[12px] text-red-600">{errorMessage}</div>
  {/if}
</div>
