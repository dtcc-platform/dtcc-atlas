<script lang="ts">
  import { activePanel } from '../stores/ui'
  import { datasets } from '../stores/datasets'
  import { Icons } from '../ui/icons'
  import { fetchDatasetList } from '../api/dataset-api'
  import {
    createUploadBatch,
    ingestUploadBatch,
    runQualityCheck,
    checkAiAvailable,
    type UploadCandidate,
    type UploadBatchProgress,
    type IngestCandidateOverride,
    type CandidateVerdict,
  } from '../api/upload-api'
  import type { BoundingBox } from '../types'

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

  interface Props {
    onIngested?: (bounds: BoundingBox, label: string) => void
  }

  let { onIngested }: Props = $props()

  type CandidateEdit = { keep: boolean; dataset_name: string; role: string; crs: string }
  let edits: Record<string, CandidateEdit> = $state({})

  let qualityChecking = $state(false)
  let qualityVerdicts: Record<string, CandidateVerdict> = $state({})
  let aiVerdicts: Record<string, CandidateVerdict> = $state({})
  let qualityError: string = $state('')
  let aiEnriched = $state(false)
  let aiAvailable: boolean | null = $state(null)
  let aiUnavailableReason = $state('')

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

  let isDragOver = $state(false)

  function handleDragOver(e: DragEvent) {
    e.preventDefault()
    isDragOver = true
  }

  function handleDragLeave() {
    isDragOver = false
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    isDragOver = false
    addFiles(e.dataTransfer?.files ?? null)
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
      // Populate instant deterministic verdicts from upload response
      const verdictMap: Record<string, CandidateVerdict> = {}
      for (const c of resp.candidates) {
        const cAny = c as UploadCandidate & {
          verdict?: string | null
          verdict_issues?: Array<{ severity: 'warn' | 'fail'; code: string; message: string }> | null
          verdict_summary?: string | null
        }
        if (cAny.verdict) {
          verdictMap[c.name] = {
            name: c.name,
            verdict: cAny.verdict as 'pass' | 'warn' | 'fail',
            issues: cAny.verdict_issues ?? [],
            metadata: {},
            thumbnail_path: null,
            summary: cAny.verdict_summary ?? '',
          }
        }
      }
      qualityVerdicts = verdictMap
      step = 'review'
      // Check AI availability in background (non-blocking)
      checkAiAvailable().then((r) => {
        aiAvailable = r.available
        aiUnavailableReason = r.reason
      })
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

      // Zoom map to uploaded data extent
      if (resp.combined_bounds) {
        const bounds: BoundingBox = {
          minX: resp.combined_bounds.minX,
          minY: resp.combined_bounds.minY,
          maxX: resp.combined_bounds.maxX,
          maxY: resp.combined_bounds.maxY,
          crs: resp.combined_bounds.crs,
        }
        onIngested?.(bounds, resp.batch_name || uploadBatchName)
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'Ingestion failed'
      step = 'review'
    }
  }

  async function analyzeQuality() {
    if (!batchId) return
    qualityChecking = true
    qualityError = ''
    try {
      const resp = await runQualityCheck(batchId)
      const merged: Record<string, CandidateVerdict> = {}
      const aiOnly: Record<string, CandidateVerdict> = {}
      for (const v of resp.result.candidates) {
        const vAny = v as CandidateVerdict & { ai_summary?: string }
        // Update the overall verdict (may be stricter after AI)
        merged[v.name] = {
          ...v,
          // Only keep deterministic issues for the main verdict display
          issues: v.issues.filter((i: any) => i.source !== 'ai'),
        }
        // Collect AI-only data separately
        const aiIssues = v.issues.filter((i: any) => i.source === 'ai')
        if (aiIssues.length > 0 || vAny.ai_summary) {
          aiOnly[v.name] = {
            name: v.name,
            verdict: v.verdict,
            issues: aiIssues,
            metadata: v.metadata ?? {},
            thumbnail_path: v.thumbnail_path,
            summary: vAny.ai_summary ?? '',
          }
        }
      }
      qualityVerdicts = merged
      aiVerdicts = aiOnly
      aiEnriched = true
    } catch (e) {
      qualityError = e instanceof Error ? e.message : 'Quality check failed'
    } finally {
      qualityChecking = false
    }
  }

  function resetWizard() {
    step = 'select'
    selectedFiles = []
    batchId = null
    candidates = []
    edits = {}
    qualityVerdicts = {}
    aiVerdicts = {}
    qualityError = ''
    qualityChecking = false
    aiEnriched = false
    aiAvailable = null
    aiUnavailableReason = ''
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
  {#if step === 'select'}
    <div class="flex flex-col gap-3">
      <p class="text-[12px] text-dtcc-muted">
        Add files or a folder. Atlas will detect candidate datasets procedurally.
      </p>

      <div
        class="rounded-lg border-2 border-dashed p-4 transition-colors
          {isDragOver ? 'border-dtcc-orange bg-dtcc-orange/5' : 'border-dtcc-border bg-dtcc-bg'}"
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        ondrop={handleDrop}
        role="region"
        tabindex="0"
        aria-label="File drop zone"
      >
        <label class="block mb-3">
          <span class="block text-[12px] text-dtcc-muted mb-1">Upload name</span>
          <input
            class="h-8 w-full px-2 rounded border border-dtcc-border-light text-[12px] bg-white"
            bind:value={uploadBatchName}
            placeholder="Upload 2026-02-26 14:30"
          />
        </label>
        <div class="flex gap-2">
          <label class="px-3 py-2 rounded-lg bg-white border border-dtcc-border-light text-[12px] cursor-pointer hover:bg-black/5">
            Add files
            <input type="file" multiple class="hidden" onchange={onFilesSelected} />
          </label>
          <label class="px-3 py-2 rounded-lg bg-white border border-dtcc-border-light text-[12px] cursor-pointer hover:bg-black/5">
            Add folder
            <input type="file" multiple webkitdirectory directory class="hidden" onchange={onFilesSelected} />
          </label>
        </div>
        {#if isDragOver}
          <p class="mt-3 text-[12px] text-dtcc-orange font-medium">Drop files here...</p>
        {:else}
          <p class="mt-3 text-[12px] text-dtcc-muted">
            {selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'} selected
          </p>
        {/if}
      </div>

      <button
        class="h-10 rounded-lg text-[13px] font-medium transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none
          {loading || !selectedFiles.length
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-dtcc-orange text-white hover:bg-dtcc-orange-dark'}"
        disabled={loading || !selectedFiles.length}
        onclick={scanFiles}
      >
        {loading ? 'Scanning...' : 'Scan files'}
      </button>

      {#if loading}
        <div class="rounded-lg border border-dtcc-border-light bg-dtcc-bg p-3">
          <div class="flex items-center justify-between text-[11px] text-dtcc-muted mb-1">
            <span>{scanProgress.phase === 'uploading' ? 'Upload progress' : 'Server scan'}</span>
            <span>{scanProgress.percent.toFixed(1)}%</span>
          </div>
          <div class="h-2 bg-white border border-dtcc-border-light rounded overflow-hidden">
            <div class="h-full bg-dtcc-orange transition-all duration-200" style={`width: ${scanProgress.percent}%`}></div>
          </div>
          <p class="mt-2 text-[12px] text-dtcc-muted">{scanProgress.message || 'Working...'}</p>
          {#if scanProgress.bytesTotal > 0}
            <p class="mt-1 text-[11px] text-dtcc-muted">
              {formatBytes(scanProgress.bytesSent)} / {formatBytes(scanProgress.bytesTotal)}
            </p>
          {/if}
        </div>
      {/if}
    </div>
  {:else if step === 'review'}
    <div class="flex flex-col gap-3">
      <p class="text-[12px] text-dtcc-muted">
        Review detected candidates and adjust name, role, or CRS before ingestion.
      </p>
      {#if aiAvailable === false}
        <div class="h-9 w-full rounded-lg text-[12px] font-medium flex items-center justify-center
          bg-gray-100 border border-gray-200 text-gray-400">
          Enrich with AI — requires dtcc-agent
        </div>
      {:else}
        <button
          class="h-9 w-full rounded-lg text-[12px] font-medium transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none
            {qualityChecking
              ? 'bg-amber-100 text-amber-700 cursor-wait'
              : aiEnriched
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100'}"
          disabled={qualityChecking || aiEnriched || aiAvailable === null}
          onclick={analyzeQuality}
        >
          {qualityChecking ? 'Enriching with AI...' : aiEnriched ? 'AI enrichment complete' : 'Enrich with AI'}
        </button>
      {/if}
      {#if qualityError}
        <div class="text-[12px] text-red-600">{qualityError}</div>
      {/if}
      <div class="max-h-[420px] overflow-y-auto border border-dtcc-border-light rounded-lg">
        {#each candidates as candidate}
          <div class="p-3 border-b border-dtcc-border-light last:border-b-0">
            <div class="flex items-center justify-between gap-2 mb-2">
              <div class="text-[13px] font-medium text-dtcc-navy">{candidate.title}</div>
              <label class="text-[12px] text-dtcc-muted flex items-center gap-1">
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
                class="h-8 px-2 rounded border border-dtcc-border-light text-[12px]"
                value={edits[candidate.id]?.dataset_name ?? candidate.name}
                oninput={(e) => edits = { ...edits, [candidate.id]: { ...edits[candidate.id], dataset_name: (e.target as HTMLInputElement).value } }}
                placeholder="Dataset name"
              />
              <select
                class="h-8 px-2 rounded border border-dtcc-border-light text-[12px] bg-white"
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
                class="h-8 px-2 rounded border border-dtcc-border-light text-[12px]"
                value={edits[candidate.id]?.crs ?? ''}
                oninput={(e) => edits = { ...edits, [candidate.id]: { ...edits[candidate.id], crs: (e.target as HTMLInputElement).value } }}
                placeholder="CRS override (optional)"
              />
            </div>

            <div class="mt-2 text-[11px] text-dtcc-muted">
              Type: {candidate.inferred_type} • Confidence: {candidate.confidence}
            </div>
            {#if candidate.warnings?.length}
              <div class="mt-1 text-[11px] text-orange-600">
                {candidate.warnings.join(' | ')}
              </div>
            {/if}
            {#if qualityVerdicts[candidate.name]}
              {@const v = qualityVerdicts[candidate.name]}
              <div class="mt-2 p-2 rounded text-[11px]
                {v.verdict === 'pass' ? 'bg-green-50 text-green-700' :
                 v.verdict === 'warn' ? 'bg-amber-50 text-amber-700' :
                 'bg-red-50 text-red-700'}">
                <div class="font-medium mb-1">
                  {v.verdict === 'pass' ? 'PASS' : v.verdict === 'warn' ? 'WARNING' : 'FAIL'}
                </div>
                {#if v.issues.length > 0}
                  <ul class="mt-1 list-disc list-inside">
                    {#each v.issues as issue}
                      <li>{issue.code}: {issue.message}</li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/if}
            {#if aiVerdicts[candidate.name]}
              {@const ai = aiVerdicts[candidate.name]}
              <div class="mt-1 p-2 rounded text-[11px] bg-blue-50 text-blue-700 border border-blue-100">
                <div class="font-medium mb-1">AI Insights</div>
                {#if ai.summary}
                  <div>{ai.summary}</div>
                {/if}
                {#if ai.issues.length > 0}
                  <ul class="mt-1 list-disc list-inside">
                    {#each ai.issues as issue}
                      <li>{issue.code}: {issue.message}</li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <div class="flex gap-2">
        <button
          class="h-9 px-3 rounded-lg border border-dtcc-border-light text-[12px] hover:bg-black/5 cursor-pointer focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
          onclick={resetWizard}
        >
          Start over
        </button>
        <button
          class="h-9 flex-1 rounded-lg text-[13px] font-medium bg-dtcc-orange text-white hover:bg-dtcc-orange-dark cursor-pointer focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
          onclick={ingest}
        >
          Ingest selected
        </button>
      </div>
    </div>
  {:else if step === 'ingesting'}
    <div class="py-8 text-center">
      <div class="w-8 h-8 mx-auto border-2 border-dtcc-orange border-t-transparent rounded-full animate-spin"></div>
      <p class="mt-3 text-[13px] text-dtcc-navy">Ingesting datasets...</p>
      <p class="text-[12px] text-dtcc-muted">Normalizing files and registering catalog entries</p>
    </div>
  {:else if step === 'complete'}
    <div class="flex flex-col gap-3">
      <div class="p-3 rounded-lg bg-green-50 text-green-700 text-[12px]">
        Ingestion completed.
      </div>
      <p class="text-[12px] text-dtcc-muted">
        {ingestResult?.ingested_count ?? 0} ingested, {ingestResult?.failed_count ?? 0} failed.
      </p>
      <div class="flex gap-2">
        <button
          class="h-9 px-3 rounded-lg border border-dtcc-border-light text-[12px] hover:bg-black/5 cursor-pointer focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
          onclick={resetWizard}
        >
          Upload more
        </button>
        <button
          class="h-9 flex-1 rounded-lg text-[13px] font-medium bg-dtcc-orange text-white hover:bg-dtcc-orange-dark cursor-pointer focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
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
