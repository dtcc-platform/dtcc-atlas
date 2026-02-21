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
  import { activePanel, searchOpen, closeAllPanels } from './lib/stores/ui'
  import type { SavedBookmark } from './lib/types/bookmarks'

  let mapView: MapView

  function handleBookmarkLoad(bookmark: SavedBookmark) {
    mapView?.loadBbox(bookmark.bbox)
    activePanel.set(null)
  }

  function handleBookmarkDelete(id: string) {
    console.log('Delete bookmark:', id)
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
    <SearchPalette onSelect={(r) => mapView?.flyTo(parseFloat(r.lon), parseFloat(r.lat))} />
    <JobTray />
  </div>
</div>
