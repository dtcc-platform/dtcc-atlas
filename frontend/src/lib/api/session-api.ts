import { API_BASE_URL } from '../config'

export interface SessionData {
  id: string
  created_at: string
  last_accessed: string
  state: {
    map?: {
      center?: [number, number]
      zoom?: number
      pitch?: number
      bearing?: number
      is3D?: boolean
    }
    ui?: {
      activePanel?: string | null
    }
  }
  bookmarks: Array<{
    id: string
    name: string
    bbox: { minX: number; minY: number; maxX: number; maxY: number; crs: string }
    createdAt: number
    color?: string
  }>
  batches: Array<Record<string, unknown>>
}

export async function createSession(): Promise<{ id: string; created_at: string }> {
  const resp = await fetch(`${API_BASE_URL}/sessions`, { method: 'POST' })
  if (!resp.ok) throw new Error(`Failed to create session: ${resp.status}`)
  return resp.json()
}

export async function getSession(sessionId: string): Promise<SessionData | null> {
  const resp = await fetch(`${API_BASE_URL}/sessions/${sessionId}`)
  if (resp.status === 404) return null
  if (!resp.ok) throw new Error(`Failed to get session: ${resp.status}`)
  return resp.json()
}

export async function updateSessionState(sessionId: string, state: Record<string, unknown>): Promise<void> {
  await fetch(`${API_BASE_URL}/sessions/${sessionId}/state`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  })
}

export async function updateSessionBookmarks(sessionId: string, bookmarks: unknown[]): Promise<void> {
  await fetch(`${API_BASE_URL}/sessions/${sessionId}/bookmarks`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookmarks),
  })
}
