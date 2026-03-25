<script lang="ts">
  import { Icons } from '../ui/icons'
  import { sessionId } from '../stores/session'
  import { jobService } from '../services/job-service'
  import SessionCapsule from './SessionCapsule.svelte'

  // Design spec says "no props required" but onEditSession is threaded as a callback
  // rather than using a store/event bus -- callbacks are cleaner for one-off events.
  interface Props {
    onEditSession?: (current: string, next: string) => void
  }

  let { onEditSession }: Props = $props()

  // SIDE NAV PANEL -- DEFERRED
  // sideNavOpen toggles here but panel component does not exist yet
  // Do not implement panel until design is confirmed
  let sideNavOpen = $state(false)

  // Server connection status (binary: connected/disconnected)
  // STATUS DOT -- IDLE STATE DEFERRED
  // jobService.isConnected() is boolean (connected/disconnected only)
  // Yellow/idle state requires a new detection mechanism -- not implemented yet
  let connected = $state(false)

  // Cursor-following tooltip
  let tooltipVisible = $state(false)
  let tooltipX = $state(0)

  function toggleSideNav() {
    sideNavOpen = !sideNavOpen
  }

  function handleTitleMouseMove(e: MouseEvent) {
    tooltipX = e.clientX
    tooltipVisible = true
  }

  function handleTitleMouseLeave() {
    tooltipVisible = false
  }

  $effect(() => {
    const interval = setInterval(() => {
      connected = jobService.isConnected()
    }, 2000)
    return () => clearInterval(interval)
  })
</script>

<!-- Topbar floating capsule -->
<header
  class="fixed top-4 left-4 right-4 h-[49px] z-50
    flex items-center justify-between
    bg-white/10 backdrop-blur-xl
    border border-white/20
    shadow-[0_0_30px_rgba(255,255,255,0.15)]
    rounded-[50px] overflow-clip
    pl-[13px] pr-[2px]"
>
  <!-- Left: hamburger menu -->
  <div class="shrink-0 h-[40px] flex items-center">
    <button
      class="w-[53px] h-[40px] flex items-center justify-center rounded-lg cursor-pointer transition-colors
        {sideNavOpen ? '' : 'hover:bg-black/5'}
        focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
      style={sideNavOpen ? '--stroke-0: #E35A1D' : ''}
      onclick={toggleSideNav}
      aria-label="Toggle navigation menu"
      aria-expanded={sideNavOpen}
    >
      <span class="w-[30px] h-[22px]">{@html Icons.hamburger}</span>
    </button>
  </div>

  <!-- Center: title + status dot (absolutely centered) -->
  <div
    class="absolute left-1/2 -translate-x-1/2 h-[40px] flex items-center"
    onmousemove={handleTitleMouseMove}
    onmouseleave={handleTitleMouseLeave}
    role="status"
  >
    <div class="relative">
      <span class="text-black font-semibold text-[16px] leading-[24px] whitespace-nowrap select-none">
        DTCC Atlas v.0.2.2
      </span>
      <!-- Server status dot: positioned outside the text bounding box at top-right corner -->
      <!-- Figma shows the dot overlapping the corner, so negative offsets are correct -->
      <div
        class="absolute -top-[2px] right-[-15px] w-[15px] h-[15px] rounded-full
          {connected ? 'bg-green-400' : 'bg-red-400'}"
        aria-label={connected ? 'Server: Ready' : 'Server: Disconnected'}
      ></div>
    </div>
  </div>

  <!-- Right: session capsule -->
  <div class="shrink-0 h-[40px] flex items-center justify-end">
    {#if $sessionId}
      <SessionCapsule
        sessionCode={$sessionId}
        onEditSession={(current, next) => onEditSession?.(current, next)}
      />
    {/if}
  </div>
</header>

<!-- Cursor-following tooltip -->
{#if tooltipVisible}
  <div
    class="fixed pointer-events-none z-50
      px-2.5 py-1 rounded-md bg-dtcc-navy text-white text-[11px] font-medium whitespace-nowrap shadow-lg
      transition-opacity delay-300"
    style="top: 70px; left: {tooltipX}px; transform: translateX(-50%);"
  >
    {connected ? 'Server: Ready' : 'Server: Disconnected'}
  </div>
{/if}

<style>
  /* Render hamburger icon SVG at its natural size */
  button span :global(svg) {
    width: 30px;
    height: 22px;
  }
</style>
