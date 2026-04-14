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
  class="fixed z-40 h-[var(--atlas-topbar-height)]
    flex items-center justify-between
    bg-white/50 backdrop-blur-xl
    border border-white/20
    shadow-[0_0_30px_rgba(255,255,255,0.15)]
    rounded-[999px]"
  style="top: var(--atlas-edge-gap); left: var(--atlas-edge-gap); right: var(--atlas-edge-gap); padding-left: var(--atlas-topbar-padding-left); padding-right: var(--atlas-topbar-padding-right);"
>
  <!-- Left: hamburger menu -->
  <div class="shrink-0 h-[var(--atlas-topbar-inner-height)] flex items-center">
    <button
      class="w-[var(--atlas-topbar-button-width)] h-[var(--atlas-topbar-inner-height)] flex items-center justify-center rounded-lg cursor-pointer transition-colors
        {sideNavOpen ? '' : 'hover:bg-black/5'}
        focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
      style={sideNavOpen ? '--stroke-0: #E35A1D' : ''}
      onclick={toggleSideNav}
      aria-label="Toggle navigation menu"
      aria-expanded={sideNavOpen}
    >
      <span class="w-[var(--atlas-topbar-menu-icon-width)] h-[var(--atlas-topbar-menu-icon-height)]">{@html Icons.hamburger}</span>
    </button>
  </div>

  <!-- Center: title + status dot (absolutely centered) -->
  <div
    class="absolute left-1/2 -translate-x-1/2 h-[var(--atlas-topbar-inner-height)] flex items-center"
    onmousemove={handleTitleMouseMove}
    onmouseleave={handleTitleMouseLeave}
    role="status"
  >
    <div class="relative">
      <span class="text-dtcc-dark font-semibold whitespace-nowrap select-none"
        style="font-size: var(--atlas-topbar-title-size); line-height: var(--atlas-topbar-title-line-height);">
        DTCC Atlas v.0.2.3
      </span>
      <!-- Server status dot: ~70% of previous 15px = 10px, offset increased per Figma 148-1368 -->
      <div
        class="absolute rounded-full
          {connected ? 'bg-green-400' : 'bg-red-400'}"
        style="top: clamp(-4px, -0.42vw, -6px); right: clamp(-10px, -0.97vw, -14px); width: var(--atlas-status-dot-size); height: var(--atlas-status-dot-size);"
        aria-label={connected ? 'Server: Ready' : 'Server: Disconnected'}
      ></div>
    </div>
  </div>

  <!-- Right: session capsule -->
  <div class="shrink-0 h-[var(--atlas-topbar-inner-height)] flex items-center justify-end">
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
    class="fixed pointer-events-none z-[60]
      px-2.5 py-1 rounded-md bg-dtcc-navy text-white font-medium whitespace-nowrap shadow-lg
      transition-opacity delay-300"
    style="top: calc(var(--atlas-edge-gap) + var(--atlas-topbar-height) + 6px); left: {tooltipX}px; transform: translateX(-50%); font-size: var(--atlas-tooltip-font-size);"
  >
    {connected ? 'Server: Ready' : 'Server: Disconnected'}
  </div>
{/if}

<style>
  /* Render hamburger icon SVG at its natural size */
  button span :global(svg) {
    width: var(--atlas-topbar-menu-icon-width);
    height: var(--atlas-topbar-menu-icon-height);
  }
</style>
