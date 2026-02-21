<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { get } from 'svelte/store'
  import Header from './lib/components/Header.svelte'
  import MapView from './lib/components/MapView.svelte'
  import Toolbar from './lib/components/Toolbar.svelte'
  import SidePanel from './lib/components/SidePanel.svelte'
  import DatasetList from './lib/components/DatasetList.svelte'
  import DatasetForm from './lib/components/DatasetForm.svelte'
  import BookmarkList from './lib/components/BookmarkList.svelte'
  import SearchPalette from './lib/components/SearchPalette.svelte'
  import JobTray from './lib/components/JobTray.svelte'
  import EmptyState from './lib/components/EmptyState.svelte'
  import SaveBookmarkDialog from './lib/components/SaveBookmarkDialog.svelte'
  import { activePanel, searchOpen, closeAllPanels, is3D, drawingActive } from './lib/stores/ui'
  import { bbox } from './lib/stores/map'
  import { bookmarks } from './lib/stores/bookmarks'
  import { jobs } from './lib/stores/jobs'
  import { BookmarkManager } from './lib/bookmarks/bookmark-manager'
  import { LocalBookmarkStorage } from './lib/storage/local-bookmark-storage'
  import { jobService } from './lib/services/job-service'
  import type { Job } from './lib/services/job-service'
  import type { SavedBookmark } from './lib/types/bookmarks'

  let mapView: MapView
  let saveDialogOpen = $state(false)

  function onBookmarksChanged() {
    bookmarks.set(bookmarkMgr.getAllBookmarks())
  }

  // Create bookmark manager with localStorage backend
  const bookmarkStorage = new LocalBookmarkStorage()
  const bookmarkMgr = new BookmarkManager(bookmarkStorage)

  // Cleanup functions for SSE event listeners
  let unsubJobEvents: (() => void) | null = null

  onMount(async () => {
    // Initialize bookmarks from storage
    await bookmarkMgr.initialize()
    bookmarks.set(bookmarkMgr.getAllBookmarks())

    // Listen for bookmark changes (from BookmarkManager events)
    bookmarkMgr.on('bookmarks-changed', onBookmarksChanged)

    // Connect SSE for real-time job updates
    jobService.connectSSE()

    // Load existing jobs
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
      {/if}
    </SidePanel>
    <EmptyState />
    <SearchPalette onSelect={(r) => mapView?.flyTo(parseFloat(r.lon), parseFloat(r.lat))} />
    <SaveBookmarkDialog bind:open={saveDialogOpen} onSave={handleSaveBookmark} />
    <JobTray onRetry={handleRetryJob} />
  </div>
</div>
