<script lang="ts">
  import { Icons } from '../ui/icons'
  import { sessionId } from '../stores/session'
  import { sideNavOpen } from '../stores/ui'
  import { jobService } from '../services/job-service'
  import SessionCapsule from './SessionCapsule.svelte'

  interface Props {
    onEditSession?: (current: string, next: string) => void
  }

  let { onEditSession }: Props = $props()

  // Momentary orange flash on hamburger click
  let hamburgerFlash = $state(false)

  let serverStatus = $state<'ready' | 'idle' | 'disconnected'>('disconnected')

  // Cursor-following tooltip for status dot
  let tooltipVisible = $state(false)
  let tooltipX = $state(0)

  function toggleSideNav() {
    sideNavOpen.update(v => !v)
    hamburgerFlash = true
    setTimeout(() => { hamburgerFlash = false }, 180)
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
      serverStatus = jobService.getStatus()
    }, 2000)
    return () => clearInterval(interval)
  })

  // Shared capsule visual classes (glass language from existing TopNavBar)
  const capsuleClass = 'fixed z-40 h-[var(--atlas-topbar-height)] flex items-center bg-white/50 backdrop-blur-xl border border-white/20 shadow-[0_0_30px_rgba(255,255,255,0.15)] rounded-[999px]'
  // Visual-only variant — no fixed/z-index — used when capsule sits inside a positioned parent
  const capsuleVisual = 'h-[var(--atlas-topbar-height)] flex items-center bg-white/50 backdrop-blur-xl border border-white/20 shadow-[0_0_30px_rgba(255,255,255,0.15)] rounded-[999px]'
</script>

<!-- DTCC logo capsule — anchored top-left, expands to SideNav width on open -->
<div
  class="{capsuleClass} overflow-hidden"
  style="
    top: var(--atlas-edge-gap);
    left: var(--atlas-edge-gap);
    width: {$sideNavOpen ? '171px' : 'var(--atlas-sidebar-width)'};
    transition: width 300ms ease-out;
  "
>
  <button
    class="flex justify-start items-center h-full w-full cursor-pointer rounded-[999px]
      hover:bg-black/5 transition-colors
      focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
    style="padding-left: calc((var(--atlas-sidebar-width) - var(--atlas-nav-item-width)) / 2);"
    onclick={toggleSideNav}
    aria-label="Toggle navigation menu"
    aria-expanded={$sideNavOpen}
  >
    <!-- DTCC logo icon — fixed-width slot, anchored left -->
    <span class="shrink-0 flex items-center justify-center" style="width: {$sideNavOpen ? 'calc(var(--atlas-nav-item-width) * 0.875)' : 'var(--atlas-nav-item-width)'}; height: var(--atlas-nav-item-height); transition: width 300ms ease-out;">
      <!-- DTCC logo — revert to {@html Icons.hamburger} if needed -->
      <img
        src="/dtcc-logo.svg"
        alt="DTCC"
        style="width: calc(var(--atlas-nav-item-width) * 0.68); height: calc(var(--atlas-nav-item-height) * 0.68); object-fit: contain; opacity: {hamburgerFlash ? '0.6' : '1'}; transition: opacity 150ms;"
      />
    </span>

    <!-- Two-line name — fades in when expanded -->
    <span
      class="overflow-hidden"
      style="
        opacity: {$sideNavOpen ? '1' : '0'};
        max-width: {$sideNavOpen ? '115px' : '0'};
        padding-left: {$sideNavOpen ? '4px' : '0'};
        transition: opacity 200ms ease-out {$sideNavOpen ? '150ms' : '0ms'}, max-width 300ms ease-out, padding-left 300ms ease-out;
      "
    >
      <span class="block font-semibold text-black whitespace-nowrap" style="font-size: calc(var(--atlas-topbar-title-size) * 1.15); line-height: 1.2;">DTCC</span>
      <span class="block font-normal whitespace-nowrap" style="font-size: 8.5px; line-height: 1.2; color: rgba(0,0,0,0.45);">Digital Twin Cities Centre</span>
    </span>
  </button>
</div>

<!-- Title + Session capsules — shifts right when nav opens -->
<!-- flex-row-reverse anchors session to the right edge; DTCC Atlas fills remaining space leftward -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="fixed z-40 flex flex-row-reverse items-center transition-all duration-300 ease-out"
  style="top: var(--atlas-edge-gap); right: var(--atlas-edge-gap); gap: var(--atlas-panel-gap); width: var(--atlas-panel-width);"
>
  <!-- Session capsule — first in HTML = rightmost in row-reverse; right edge = panel right edge -->
  {#if $sessionId}
    <div class="shrink-0">
      <SessionCapsule
        sessionCode={$sessionId}
        onEditSession={(current, next) => onEditSession?.(current, next)}
      />
    </div>
  {/if}

  <!-- Title capsule — second in HTML = leftmost in row-reverse; grows to fill remaining width -->
  <div
    class="{capsuleVisual} grow shrink-0 justify-center"
    style="padding: 0 var(--atlas-topbar-padding-left);"
    onmousemove={handleTitleMouseMove}
    onmouseleave={handleTitleMouseLeave}
    role="status"
    aria-label={serverStatus === 'ready' ? 'Server: Ready' : serverStatus === 'idle' ? 'Server: Idle' : 'Server: Disconnected'}
  >
    <div
      class="flex items-center whitespace-nowrap select-none"
      style="gap: calc(var(--atlas-topbar-height) * 0.28);"
    >
      <!-- Status dot — aspect-square forces a perfect circle regardless of flex context -->
      <div
        class="shrink-0 rounded-full aspect-square {serverStatus === 'ready' ? 'bg-green-400' : serverStatus === 'idle' ? 'bg-yellow-400' : 'bg-red-400'}"
        style="width: var(--atlas-status-dot-size);"
      ></div>
      <!-- Primary product name — SemiBold, pure black per Figma -->
      <span
        class="text-black font-semibold"
        style="font-size: var(--atlas-topbar-title-size); line-height: var(--atlas-topbar-title-line-height);"
      >
        DTCC Atlas
      </span>
      <!-- Version — SF Pro Regular, 40% black, no chip -->
      <span
        class="font-normal"
        style="font-size: var(--atlas-topbar-title-size); line-height: var(--atlas-topbar-title-line-height); color: rgba(0,0,0,0.4); font-family: -apple-system, BlinkMacSystemFont, sans-serif;"
      >
        v0.2.3
      </span>
    </div>
  </div>
</div>

<!-- Status dot tooltip — cursor-following, appears below title capsule -->
{#if tooltipVisible}
  <div
    class="fixed pointer-events-none z-[60]
      px-2.5 py-1 rounded-md bg-dtcc-navy text-white font-medium whitespace-nowrap shadow-lg
      transition-opacity delay-300"
    style="top: calc(var(--atlas-edge-gap) + var(--atlas-topbar-height) + 6px); left: {tooltipX}px; transform: translateX(-50%); font-size: var(--atlas-tooltip-font-size);"
  >
    {serverStatus === 'ready' ? 'Server: Ready' : serverStatus === 'idle' ? 'Server: Idle' : 'Server: Disconnected'}
  </div>
{/if}

<style>
  button span :global(svg) {
    width: var(--atlas-nav-icon-size);
    height: var(--atlas-nav-icon-size);
  }
</style>
