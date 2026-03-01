import { API_BASE_URL } from '../config'

export interface UploadCandidate {
  id: string
  candidate_key: string
  name: string
  title: string
  inferred_type: string
  role: string
  confidence: string
  primary_rel_path: string
  group_rel_paths: string[]
  warnings: string[]
  metadata: Record<string, unknown>
  detected_format: string
}

export interface UploadBatchResponse {
  batch_id: string
  batch_name?: string
  file_count: number
  total_bytes: number
  candidates: UploadCandidate[]
}

export interface IngestCandidateOverride {
  candidate_id: string
  keep: boolean
  dataset_name?: string
  role?: string
  crs?: string
}

export interface IngestResponse {
  batch_id: string
  ingested_count: number
  failed_count: number
  ingested: Array<Record<string, unknown>>
  failed: Array<Record<string, unknown>>
}

export interface UploadBatchProgress {
  phase: 'uploading' | 'scanning'
  bytesSent: number
  bytesTotal: number
  percent: number
  message: string
}

export async function createUploadBatch(
  files: File[],
  batchName?: string,
  onProgress?: (progress: UploadBatchProgress) => void,
): Promise<UploadBatchResponse> {
  if (!files.length) {
    throw new Error('No files selected')
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  const formData = new FormData()
  for (const file of files) {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath
    formData.append('files', file, relative && relative.length > 0 ? relative : file.name)
  }
  if (batchName && batchName.trim()) {
    formData.append('batch_name', batchName.trim())
  }

  onProgress?.({
    phase: 'uploading',
    bytesSent: 0,
    bytesTotal: totalBytes,
    percent: 0,
    message: 'Uploading files to Atlas...',
  })

  return new Promise<UploadBatchResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    let uploadComplete = false

    xhr.open('POST', `${API_BASE_URL}/uploads/batches`)
    xhr.responseType = 'json'

    xhr.upload.onprogress = (event: ProgressEvent<EventTarget>) => {
      const bytesSent = event.lengthComputable ? event.loaded : 0
      const bytesTotalFromEvent = event.lengthComputable ? event.total : 0
      const bytesTotalFinal = bytesTotalFromEvent > 0 ? bytesTotalFromEvent : totalBytes
      const percent =
        bytesTotalFinal > 0
          ? Math.min(100, Math.max(0, (bytesSent / bytesTotalFinal) * 100))
          : 0

      onProgress?.({
        phase: 'uploading',
        bytesSent,
        bytesTotal: bytesTotalFinal,
        percent,
        message: `Uploading files to Atlas... ${percent.toFixed(1)}%`,
      })
    }

    xhr.upload.onload = () => {
      uploadComplete = true
      onProgress?.({
        phase: 'scanning',
        bytesSent: totalBytes,
        bytesTotal: totalBytes,
        percent: 100,
        message: 'Upload complete. Scanning files on server...',
      })
    }

    xhr.onreadystatechange = () => {
      if (uploadComplete && xhr.readyState > 1 && xhr.readyState < 4) {
        onProgress?.({
          phase: 'scanning',
          bytesSent: totalBytes,
          bytesTotal: totalBytes,
          percent: 100,
          message: 'Scanning files on server...',
        })
      }
    }

    xhr.onerror = () => {
      reject(new Error('Network error while uploading files'))
    }

    xhr.onabort = () => {
      reject(new Error('Upload aborted'))
    }

    xhr.onload = () => {
      const statusOk = xhr.status >= 200 && xhr.status < 300
      const responseData = xhr.response ?? tryParseJson(xhr.responseText)

      if (!statusOk) {
        const detail = responseData?.detail || responseData?.message
        reject(new Error(detail || 'Failed to create upload batch'))
        return
      }

      resolve(responseData as UploadBatchResponse)
    }

    xhr.send(formData)
  })
}

export async function ingestUploadBatch(
  batchId: string,
  candidates: IngestCandidateOverride[]
): Promise<IngestResponse> {
  const response = await fetch(`${API_BASE_URL}/uploads/batches/${encodeURIComponent(batchId)}/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ candidates }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.detail || 'Failed to ingest upload batch')
  }

  return response.json()
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

// -- Quality Gate types --

export interface QualityIssue {
  severity: 'warn' | 'fail'
  code: string
  message: string
}

export interface CandidateVerdict {
  name: string
  verdict: 'pass' | 'warn' | 'fail'
  issues: QualityIssue[]
  metadata: Record<string, unknown>
  thumbnail_path: string | null
  summary: string
}

export interface QualityCheckResult {
  batch_id: string
  status: 'completed' | 'failed'
  result: {
    candidates: CandidateVerdict[]
  }
}

export interface CatalogReviewResult {
  status: 'completed' | 'failed'
  result: {
    health_score: number
    issues: Array<{
      code: string
      severity: string
      datasets: string[]
      message: string
    }>
    summary: string
  }
}

// -- Quality Gate API calls --

export async function runQualityCheck(batchId: string): Promise<QualityCheckResult> {
  const response = await fetch(
    `${API_BASE_URL}/uploads/batches/${encodeURIComponent(batchId)}/quality-check`,
    { method: 'POST' },
  )
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'Quality check failed')
  }
  return response.json()
}

export async function getQualityCheck(batchId: string): Promise<{
  batch_id: string
  status: string | null
  candidates: (UploadCandidate & {
    verdict?: string | null
    verdict_issues?: QualityIssue[] | null
    verdict_summary?: string | null
    thumbnail_path?: string | null
  })[]
}> {
  const response = await fetch(
    `${API_BASE_URL}/uploads/batches/${encodeURIComponent(batchId)}/quality-check`,
  )
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to get quality check')
  }
  return response.json()
}

export async function checkAiAvailable(): Promise<{ available: boolean; reason: string }> {
  const response = await fetch(`${API_BASE_URL}/uploads/ai-available`)
  if (!response.ok) {
    return { available: false, reason: 'Failed to check AI availability' }
  }
  return response.json()
}

export async function runCatalogReview(): Promise<CatalogReviewResult> {
  const response = await fetch(`${API_BASE_URL}/uploads/catalog/review`, {
    method: 'POST',
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'Catalog review failed')
  }
  return response.json()
}
