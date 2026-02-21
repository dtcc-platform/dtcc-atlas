<script lang="ts">
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
  import { activePanel, searchOpen, closeAllPanels } from './lib/stores/ui'
  import { bbox } from './lib/stores/map'
  import { bookmarks } from './lib/stores/bookmarks'
  import type { SavedBookmark } from './lib/types/bookmarks'

  let mapView: MapView
  let saveDialogOpen = $state(false)

  function handleBookmarkLoad(bookmark: SavedBookmark) {
    mapView?.loadBbox(bookmark.bbox)
    activePanel.set(null)
  }

  function handleBookmarkDelete(id: string) {
    console.log('Delete bookmark:', id)
  }

  function handleSaveBookmark(name: string) {
    const currentBbox = $bbox
    if (!currentBbox) return
    const bookmark: SavedBookmark = {
      id: crypto.randomUUID(),
      name,
      bbox: currentBbox,
      createdAt: Date.now(),
    }
    bookmarks.update(b => [...b, bookmark])
  }
</script>

<svelte:window onkeydown={(e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    searchOpen.update(v => !v)
  }
  if (e.key === 'Escape') closeAllPanels()
}} />

<div class="h-screen w-screen flex flex-col">
  <Header />
  <div class="flex-1 relative overflow-hidden">
    <MapView bind:this={mapView} />
    <Toolbar
      onClear={() => mapView?.clearBbox()}
      onSave={() => saveDialogOpen = true}
      onToggle3D={() => mapView?.toggle3D()}
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
    <JobTray />
  </div>
</div>
