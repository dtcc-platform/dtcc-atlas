import { writable } from 'svelte/store'

/**
 * The current session ID extracted from the URL /s/{hash}.
 * Set during app initialization, used by all API calls.
 */
export const sessionId = writable<string | null>(null)
export const sessionLoading = writable(true)

/**
 * Extract session ID from URL path /s/{hash}
 */
export function getSessionIdFromUrl(): string | null {
  const match = window.location.pathname.match(/^\/s\/([A-Za-z0-9_-]{6,12})$/)
  return match ? match[1] : null
}

/**
 * Navigate to session URL without full page reload.
 */
export function navigateToSession(id: string): void {
  window.history.replaceState({}, '', `/s/${id}`)
}
