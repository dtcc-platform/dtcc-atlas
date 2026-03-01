<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { get } from 'svelte/store'
  import Header from './lib/components/Header.svelte'
  import MapView from './lib/components/MapView.svelte'
  import Toolbar from './lib/components/Toolbar.svelte'
  import SidePanel from './lib/components/SidePanel.svelte'
  import DatasetList from './lib/components/DatasetList.svelte'
  import DatasetForm from './lib/components/DatasetForm.svelte'
  import UploadWizard from './lib/components/UploadWizard.svelte'
  import BookmarkList from './lib/components/BookmarkList.svelte'
  import SearchPalette from './lib/components/SearchPalette.svelte'
  import JobTray from './lib/components/JobTray.svelte'
  import EmptyState from './lib/components/EmptyState.svelte'
  import SaveBookmarkDialog from './lib/components/SaveBookmarkDialog.svelte'
  import { activePanel, searchOpen, closeAllPanels, is3D, drawingActive } from './lib/stores/ui'
  import type { PanelView } from './lib/stores/ui'
  import { bbox } from './lib/stores/map'
  import { bookmarks } from './lib/stores/bookmarks'
  import { jobs } from './lib/stores/jobs'
  import { sessionId, sessionLoading, getSessionIdFromUrl, navigateToSession } from './lib/stores/session'
  import { BookmarkManager } from './lib/bookmarks/bookmark-manager'
  import { LocalBookmarkStorage } from './lib/storage/local-bookmark-storage'
  import { jobService } from './lib/services/job-service'
  import { createSession, getSession, updateSessionState, updateSessionBookmarks } from './lib/api/session-api'
  import { fetchDatasetList } from './lib/api/dataset-api'
  import { datasets } from './lib/stores/datasets'
  import type { SessionData } from './lib/api/session-api'
  import type { Job } from './lib/services/job-service'
  import type { SavedBookmark } from './lib/types/bookmarks'

  let mapView: MapView
  let saveDialogOpen = $state(false)

  function onBookmarksChanged() {
    const allBookmarks = bookmarkMgr.getAllBookmarks()
    bookmarks.set(allBookmarks)

    // Sync to server
    const sid = get(sessionId)
    if (sid) {
      updateSessionBookmarks(sid, allBookmarks).catch(e =>
        console.warn('Failed to sync bookmarks:', e)
      )
    }
  }

  // Create bookmark manager with localStorage backend
  const bookmarkStorage = new LocalBookmarkStorage()
  const bookmarkMgr = new BookmarkManager(bookmarkStorage)

  // Cleanup functions for SSE event listeners and store subscriptions
  let unsubJobEvents: (() => void) | null = null
  let unsubPanel: (() => void) | null = null
  let unsubIs3D: (() => void) | null = null
  let stateSyncTimer: ReturnType<typeof setTimeout> | null = null

  // Debounced state sync to server
  function syncStateToServer() {
    if (stateSyncTimer) clearTimeout(stateSyncTimer)
    stateSyncTimer = setTimeout(async () => {
      const sid = get(sessionId)
      if (!sid) return
      const mapState = mapView?.getMapState?.() ?? null
      const state = {
        ui: { activePanel: get(activePanel) },
        map: mapState ? { ...mapState, is3D: get(is3D) } : { is3D: get(is3D) }
      }
      try {
        await updateSessionState(sid, state)
      } catch (e) {
        console.warn('Failed to sync state:', e)
      }
    }, 5000) // 5-second debounce
  }

  onMount(async () => {
    // --- Session initialization ---
    const urlSessionId = getSessionIdFromUrl()

    let sessionData: SessionData | null = null

    if (urlSessionId) {
      // Try to resume existing session
      sessionData = await getSession(urlSessionId)
      if (sessionData) {
        sessionId.set(sessionData.id)
      } else {
        // Session not found — create new
        const newSession = await createSession()
        sessionId.set(newSession.id)
        navigateToSession(newSession.id)
      }
    } else {
      // No session in URL — create new and redirect
      const newSession = await createSession()
      sessionId.set(newSession.id)
      navigateToSession(newSession.id)
    }
    sessionLoading.set(false)

    // --- Bookmark initialization (with server-side sync) ---
    if (sessionData?.bookmarks?.length) {
      // Server bookmarks override local storage
      bookmarks.set(sessionData.bookmarks as SavedBookmark[])
      // Also sync to localStorage as backup
      for (const bm of sessionData.bookmarks) {
        bookmarkStorage.save(bm as SavedBookmark)
      }
    } else {
      // No server bookmarks — use localStorage and push to server
      await bookmarkMgr.initialize()
      bookmarks.set(bookmarkMgr.getAllBookmarks())
      const sid = get(sessionId)
      if (sid && bookmarkMgr.getAllBookmarks().length > 0) {
        updateSessionBookmarks(sid, bookmarkMgr.getAllBookmarks()).catch(e =>
          console.warn('Failed to sync initial bookmarks:', e)
        )
      }
    }

    // Listen for bookmark changes (from BookmarkManager events)
    bookmarkMgr.on('bookmarks-changed', onBookmarksChanged)

    // --- Restore UI state from session ---
    if (sessionData?.state?.ui?.activePanel) {
      activePanel.set(sessionData.state.ui.activePanel as PanelView)
      // If datasets panel was open, fetch the dataset list
      if (sessionData.state.ui.activePanel === 'datasets') {
        fetchDatasetList().then(list => datasets.set(list)).catch(() => {})
      }
    }

    // --- Restore map state from session (with delay for map mount) ---
    if (sessionData?.state?.map?.center) {
      setTimeout(() => {
        mapView?.setMapState(sessionData!.state.map as {
          center?: [number, number]
          zoom?: number
          pitch?: number
          bearing?: number
        })
      }, 200)
    }

    // --- Subscribe to stores for debounced state sync ---
    unsubPanel = activePanel.subscribe(() => syncStateToServer())
    unsubIs3D = is3D.subscribe(() => syncStateToServer())

    // --- Connect SSE + load jobs (existing logic) ---
    jobService.connectSSE()

    try {
      const existingJobs = await jobService.listJobs()
      jobs.set(existingJobs)
    } catch (e) {
      console.warn('Failed to load existing jobs:', e)
    }

    // Wire SSE events to jobs store
    unsubJobEvents = jobService.onJobEvent((event) => {
      if (event.type === 'job_update' || event.type === 'job_complete' || event.type === 'job_failed') {
        jobs.update(($j) => {
          const idx = $j.findIndex(j => j.id === event.data.id)
          if (idx >= 0) {
            const updated = [...$j]
            updated[idx] = event.data
            return updated
          }
          return [...$j, event.data]
        })
      }
    })
  })

  onDestroy(() => {
    bookmarkMgr.off('bookmarks-changed', onBookmarksChanged)
    jobService.disconnectSSE()
    if (unsubJobEvents) unsubJobEvents()
    if (unsubPanel) unsubPanel()
    if (unsubIs3D) unsubIs3D()
    if (stateSyncTimer) clearTimeout(stateSyncTimer)
  })

  // Handlers
  function handleSaveBookmark(name: string) {
    const currentBbox = get(bbox)
    if (currentBbox) {
      bookmarkMgr.saveBookmark(name, currentBbox)
    }
  }

  function handleBookmarkLoad(bookmark: SavedBookmark) {
    mapView?.loadBbox(bookmark.bbox)
    activePanel.set(null)
  }

  function handleBookmarkDelete(id: string) {
    bookmarkMgr.deleteBookmark(id)
  }

  function handleToggle3D() {
    mapView?.toggle3D()
    is3D.update(v => !v)
  }

  function handleClear() {
    mapView?.clearBbox()
  }

  async function handleRetryJob(job: Job) {
    if (!job.dataset || !job.params) return
    try {
      const resp = await jobService.submitJob({ dataset: job.dataset, parameters: job.params })
      jobs.update($j => [...$j, { id: resp.job_id, dataset: job.dataset, status: 'queued', params: job.params } as Job])
    } catch (e) {
      console.error('Failed to retry job:', e)
    }
  }
</script>

<svelte:window onkeydown={(e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    searchOpen.update(v => !v)
  }
  if (e.key === 'Escape') {
    closeAllPanels()
    drawingActive.set(false)
  }
}} />

<div class="h-screen w-screen flex flex-col">
  <Header />
  <div class="flex-1 relative overflow-hidden">
    <MapView bind:this={mapView} />
    <Toolbar
      onClear={handleClear}
      onSave={() => saveDialogOpen = true}
      onToggle3D={handleToggle3D}
    />
    <SidePanel>
      {#if $activePanel === 'datasets'}
        <DatasetList />
      {:else if $activePanel === 'dataset-form'}
        <DatasetForm />
      {:else if $activePanel === 'bookmarks'}
        <BookmarkList onLoad={handleBookmarkLoad} onDelete={handleBookmarkDelete} />
      {:else if $activePanel === 'uploads'}
        <UploadWizard />
      {/if}
    </SidePanel>
    <EmptyState />
    <SearchPalette onSelect={(r) => mapView?.flyTo(parseFloat(r.lon), parseFloat(r.lat))} />
    <SaveBookmarkDialog bind:open={saveDialogOpen} onSave={handleSaveBookmark} />
    <JobTray onRetry={handleRetryJob} />
  </div>
</div>
