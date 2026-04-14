<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { get } from 'svelte/store'
  // REMOVED FROM TOPBAR v0.2.2 -- preserved for potential revert
  // import Header from './lib/components/Header.svelte'
  import TopBar from './lib/components/TopBar.svelte'
  import MapView from './lib/components/MapView.svelte'
  import Toolbar from './lib/components/Toolbar.svelte'
  import NavbarHelperBottom from './lib/components/NavbarHelperBottom.svelte'
  import SidePanel from './lib/components/SidePanel.svelte'
  import DatasetList from './lib/components/DatasetList.svelte'
  import DatasetForm from './lib/components/DatasetForm.svelte'
  import UploadWizard from './lib/components/UploadWizard.svelte'
  import BookmarkList from './lib/components/BookmarkList.svelte'
  import SearchPalette from './lib/components/SearchPalette.svelte'
  import JobTray from './lib/components/JobTray.svelte'
  import EmptyState from './lib/components/EmptyState.svelte'
  import SaveBookmarkDialog from './lib/components/SaveBookmarkDialog.svelte'
  import SessionDialog from './lib/components/SessionDialog.svelte'
  import CoordinateInputDialog from './lib/components/CoordinateInputDialog.svelte'
  import LurkieChat from './lib/components/LurkieChat.svelte'
  import LayersPanel from './lib/components/LayersPanel.svelte'
  import { activePanel, searchOpen, closeAllPanels, is3D, drawingActive, unseenBookmarks, unseenDownloads, unseenLayers } from './lib/stores/ui'
  import type { PanelView } from './lib/stores/ui'
  import { bbox } from './lib/stores/map'
  import { bookmarks } from './lib/stores/bookmarks'
  import { jobs } from './lib/stores/jobs'
  import { addLayer } from './lib/stores/layers'
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
  import type { BoundingBox } from './lib/types'

  let mapView: MapView
  let saveDialogOpen = $state(false)
  let sessionDialogOpen = $state(false)
  let coordDialogOpen = $state(false)
  let sessionChangeOpen = $state(false)
  let sessionChangeCurrent = $state('')
  let sessionChangeNext = $state('')
  let sessionChangeError = $state('')

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
        if (event.type === 'job_complete' || event.type === 'job_failed') {
          unseenDownloads.update(n => n + 1)
        }
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
      unseenBookmarks.update(n => n + 1)
    }
  }

  function handleBookmarkLoad(bookmark: SavedBookmark) {
    mapView?.loadBbox(bookmark.bbox)
    mapView?.fitBounds(bookmark.bbox)
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
    drawingActive.set(false)
  }

  function handleIngested(bounds: BoundingBox, label: string) {
    mapView?.loadBbox(bounds, label)
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

  function handleEditSession(current: string, next: string) {
    // Client-side validation: alphanumeric, underscore, hyphen, 6-12 chars
    if (!/^[A-Za-z0-9_-]{6,12}$/.test(next)) {
      sessionChangeError = `Invalid session code "${next}". Must be 6-12 alphanumeric characters.`
      return
    }
    sessionChangeCurrent = current
    sessionChangeNext = next
    sessionChangeOpen = true
  }

  async function confirmSessionChange(save: boolean) {
    if (save) {
      const sid = get(sessionId)
      if (sid) {
        const mapState = mapView?.getMapState?.() ?? null
        const state = {
          ui: { activePanel: get(activePanel) },
          map: mapState ? { ...mapState, is3D: get(is3D) } : { is3D: get(is3D) }
        }
        try {
          await updateSessionState(sid, state)
        } catch (e) {
          console.warn('Failed to save session before switching:', e)
        }
      }
    }
    // Navigate to new session (full page load to reinitialize).
    // If the session code does not exist on the server, App.svelte onMount
    // will create a new session with a different ID and redirect.
    window.location.href = `/s/${sessionChangeNext}`
  }

  function cancelSessionChange() {
    sessionChangeOpen = false
    sessionChangeCurrent = ''
    sessionChangeNext = ''
  }

  function dismissSessionError() {
    sessionChangeError = ''
  }
</script>

<svelte:window onkeydown={(e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    searchOpen.update(v => !v)
  }
  if (e.key === 'Escape') {
    // Don't close panels if a session dialog is open -- those handle Escape themselves
    if (sessionChangeOpen || sessionChangeError) return
    closeAllPanels()
    drawingActive.set(false)
  }
}} />

<div class="h-screen w-screen relative">
  <!-- REMOVED FROM TOPBAR v0.2.2 -- preserved for potential revert -->
  <!-- <Header onSessionDialog={() => sessionDialogOpen = true} /> -->
  <TopBar onEditSession={handleEditSession} />
  <div class="absolute inset-0 overflow-hidden">
    <MapView bind:this={mapView} />
    <Toolbar
      onClear={handleClear}
      onToggle3D={handleToggle3D}
    />
    {#if $activePanel === 'datasets'}
      <DatasetList />
    {/if}
    <SidePanel>
      {#if $activePanel === 'dataset-form'}
        <DatasetForm />
      {:else if $activePanel === 'bookmarks'}
        {#if $bbox}
          <div class="px-4 py-3 border-b border-dtcc-border-light bg-dtcc-orange/5 flex items-center justify-between">
            <span class="text-xs text-dtcc-dark">Save current area as bookmark?</span>
            <button
              class="px-3 py-1 bg-dtcc-orange text-white text-xs font-semibold rounded hover:bg-dtcc-orange-dark transition-colors"
              onclick={() => { saveDialogOpen = true }}
            >Save</button>
          </div>
        {/if}
        <BookmarkList onLoad={handleBookmarkLoad} onDelete={handleBookmarkDelete} />
      {:else if $activePanel === 'uploads'}
        <UploadWizard onIngested={handleIngested} />
      {:else if $activePanel === 'downloads'}
        {#if $jobs.length === 0}
          <div class="p-6 text-center text-dtcc-muted">
            <p class="text-xs">No data available for download. Generate data from a drawn region first.</p>
          </div>
        {:else}
          <div class="flex flex-col gap-1">
            {#each $jobs as job (job.id)}
              <div class="px-3 py-2.5 rounded-lg border border-black/5 bg-white/30">
                <div class="flex items-center gap-2 min-w-0">
                  {#if job.status === 'processing' || job.status === 'queued'}
                    <div class="w-3 h-3 border-2 border-dtcc-orange border-t-transparent rounded-full animate-spin shrink-0"></div>
                  {:else if job.status === 'complete'}
                    <span class="w-3 h-3 text-green-500 shrink-0 text-center">&#10003;</span>
                  {:else if job.status === 'failed'}
                    <span class="w-3 h-3 text-red-500 shrink-0 text-center">&#10005;</span>
                  {/if}
                  <span class="truncate text-sm text-dtcc-dark flex-1">{job.dataset || job.id.slice(0, 8)}</span>
                  <span class="text-xs text-dtcc-muted capitalize shrink-0">{job.status}</span>
                </div>
                {#if job.status === 'processing'}
                  <div class="mt-1.5 h-1 bg-black/5 rounded-full overflow-hidden">
                    {#if job.progress?.percent != null}
                      <div class="h-full bg-dtcc-orange rounded-full transition-all duration-300" style="width: {job.progress.percent}%"></div>
                    {:else}
                      <div class="h-full bg-dtcc-orange rounded-full animate-pulse w-1/3"></div>
                    {/if}
                  </div>
                {/if}
                {#if job.status === 'complete'}
                  <div class="flex items-center gap-2 mt-2">
                    <button
                      class="flex-1 px-2 py-1 text-xs font-medium text-white bg-dtcc-orange rounded-md hover:bg-dtcc-orange-dark transition-colors cursor-pointer"
                      onclick={() => jobService.downloadResult(job.id, job.filename || 'download')}
                    >Download</button>
                    <button
                      class="flex-1 px-2 py-1 text-xs font-medium text-dtcc-dark border border-black/10 rounded-md hover:bg-black/5 transition-colors cursor-pointer"
                      onclick={() => {
                        addLayer(job.dataset || job.filename || 'Downloaded dataset')
                        unseenLayers.update(n => n + 1)
                      }}
                    >Add to layers</button>
                  </div>
                {/if}
                {#if job.status === 'failed' && job.error}
                  <p class="mt-1 text-xs text-red-500 truncate">{job.error}</p>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </SidePanel>
    {#if $activePanel === 'layers'}
      <LayersPanel />
    {/if}
    <NavbarHelperBottom />
    <LurkieChat />
    <EmptyState />
    <SearchPalette onSelect={(r) => mapView?.flyTo(parseFloat(r.lon), parseFloat(r.lat))} />
    <SaveBookmarkDialog bind:open={saveDialogOpen} onSave={handleSaveBookmark} />
    <SessionDialog bind:open={sessionDialogOpen} />
    <CoordinateInputDialog bind:open={coordDialogOpen} onApply={(b) => mapView?.loadBbox(b)} />
    <!-- JobTray removed: job progress is now shown inside the Downloads panel (spec 8.2).
         The bottom-right popup is no longer used for job notifications. -->
    <!-- <JobTray onRetry={handleRetryJob} /> -->

    <!-- Session change confirmation dialog -->
    {#if sessionChangeOpen}
      <button class="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm cursor-default" aria-label="Close dialog" onclick={cancelSessionChange}></button>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50
        w-[min(92vw,400px)] bg-white rounded-[var(--atlas-panel-radius)] shadow-2xl p-[var(--atlas-panel-padding)]"
        role="dialog" aria-modal="true" tabindex="-1"
        onkeydown={(e) => { if (e.key === 'Escape') cancelSessionChange() }}>
        <h3 class="text-[var(--atlas-panel-header-title-size)] font-semibold text-dtcc-navy mb-3">Change Session</h3>
        <p class="text-[var(--atlas-body-text-size)] text-dtcc-muted mb-5">
          Session will change from <span class="font-mono font-medium text-dtcc-navy">{sessionChangeCurrent}</span> to <span class="font-mono font-medium text-dtcc-navy">{sessionChangeNext}</span>. Would you like to proceed?
        </p>
        <div class="flex gap-2 justify-end">
          <button
            class="px-4 h-[var(--atlas-control-height)] rounded-[var(--atlas-control-radius)] text-[var(--atlas-body-text-size)] text-dtcc-muted hover:bg-black/5 cursor-pointer"
            onclick={cancelSessionChange}
          >Cancel</button>
          <button
            class="px-4 h-[var(--atlas-control-height)] rounded-[var(--atlas-control-radius)] border border-dtcc-border-light text-[var(--atlas-body-text-size)] text-dtcc-navy font-medium hover:bg-black/5 cursor-pointer"
            onclick={() => confirmSessionChange(false)}
          >Switch</button>
          <button
            class="px-4 h-[var(--atlas-control-height)] rounded-[var(--atlas-control-radius)] bg-dtcc-orange text-white text-[var(--atlas-body-text-size)] font-semibold hover:bg-dtcc-orange-dark cursor-pointer"
            onclick={() => confirmSessionChange(true)}
          >Save &amp; Switch</button>
        </div>
      </div>
    {/if}

    <!-- Session change error popup -->
    {#if sessionChangeError}
      <button class="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm cursor-default" aria-label="Close error" onclick={dismissSessionError}></button>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50
        w-[min(92vw,360px)] bg-white rounded-[var(--atlas-panel-radius)] shadow-2xl p-[var(--atlas-panel-padding)]"
        role="alertdialog" aria-modal="true" tabindex="-1"
        onkeydown={(e) => { if (e.key === 'Escape') dismissSessionError() }}>
        <h3 class="text-[var(--atlas-panel-header-title-size)] font-semibold text-red-600 mb-3">Invalid Session</h3>
        <p class="text-[var(--atlas-body-text-size)] text-dtcc-muted mb-5">{sessionChangeError}</p>
        <div class="flex justify-end">
          <button
            class="px-4 h-[var(--atlas-control-height)] rounded-[var(--atlas-control-radius)] bg-dtcc-navy text-white text-[var(--atlas-body-text-size)] font-semibold hover:bg-dtcc-navy/90 cursor-pointer"
            onclick={dismissSessionError}
          >OK</button>
        </div>
      </div>
    {/if}
  </div>
</div>
