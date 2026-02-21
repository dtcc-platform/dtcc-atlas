<script lang="ts">
  import Header from './lib/components/Header.svelte'
  import MapView from './lib/components/MapView.svelte'
  import Toolbar from './lib/components/Toolbar.svelte'

  let mapView: MapView
</script>

<div class="h-screen w-screen flex flex-col">
  <Header />
  <div class="flex-1 relative overflow-hidden">
    <MapView bind:this={mapView} />
    <Toolbar
      onClear={() => mapView?.clearBbox()}
      onToggle3D={() => mapView?.toggle3D()}
    />
  </div>
</div>
