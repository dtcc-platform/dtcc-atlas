import { writable, derived } from 'svelte/store'
import type { SavedBookmark } from '../types/bookmarks'

export const bookmarks = writable<SavedBookmark[]>([])
export const bookmarkCount = derived(bookmarks, ($b) => $b.length)
