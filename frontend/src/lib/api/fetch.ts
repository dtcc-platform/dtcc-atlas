import { get } from 'svelte/store'
import { sessionId } from '../stores/session'

/**
 * Fetch wrapper that injects X-Session-Id header on all requests.
 */
export function sessionFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const sid = get(sessionId)
  const headers = new Headers(init?.headers)
  if (sid) {
    headers.set('X-Session-Id', sid)
  }
  return fetch(input, { ...init, headers })
}
