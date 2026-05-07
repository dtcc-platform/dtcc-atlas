<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte'
  import { slide } from 'svelte/transition'
  import { Marked } from 'marked'
  import DOMPurify from 'dompurify'
  import { Icons } from '../ui/icons'
  import { chatMessages, chatLoading, chatError, addUserMessage, clearChat, hasMessages } from '../stores/chat-store'
  import { chatService } from '../services/chat-service'
  import { activePanel, collapsedPanels, togglePanelCollapsed, activeDatasetPanelIds } from '../stores/ui'

  const md = new Marked({ breaks: true })
  const renderMarkdown = (text: string) =>
    DOMPurify.sanitize(md.parse(text, { async: false }))

  const LURKIE_LABELS = [
    'Lurking...', 'Pondering...', 'Tinkering...', 'Snooping...', 'Crunching...',
    'Investigating...', 'Inspecting...', 'Examining...', 'Scouting...', 'Surveying...', 'Peeking...',
    'Scheming...', 'Brewing...', 'Noodling...', 'Rummaging...',
    'Computing...', 'Processing...', 'Digesting...',
    'Mulling...', 'Conjuring...', 'Percolating...', 'Marinating...', 'Untangling...', 'Deciphering...',
  ]
  let lurkieLabel = $state(LURKIE_LABELS[0])
  let lurkieLabelFaded = $state(false)
  let lurkieLabelTimer: ReturnType<typeof setInterval> | null = null
  let lurkieFadeTimer: ReturnType<typeof setTimeout> | null = null

  function nextLurkieLabel() {
    let next: string
    do {
      next = LURKIE_LABELS[Math.floor(Math.random() * LURKIE_LABELS.length)]
    } while (next === lurkieLabel)
    lurkieLabel = next
  }

  function lurkieTick() {
    lurkieLabelFaded = true
    lurkieFadeTimer = setTimeout(() => {
      nextLurkieLabel()
      lurkieLabelFaded = false
      lurkieFadeTimer = null
    }, 300)
  }

  $effect(() => {
    if ($chatLoading) {
      if (!lurkieLabelTimer) {
        lurkieLabel = LURKIE_LABELS[Math.floor(Math.random() * LURKIE_LABELS.length)]
        lurkieLabelFaded = false
        lurkieLabelTimer = setInterval(lurkieTick, 3000)
      }
    } else {
      if (lurkieLabelTimer) { clearInterval(lurkieLabelTimer); lurkieLabelTimer = null }
      if (lurkieFadeTimer) { clearTimeout(lurkieFadeTimer); lurkieFadeTimer = null }
      lurkieLabelFaded = false
    }
  })

  // --- Right-panel awareness ---
  // Only panels that physically dock to the RIGHT edge affect Lurkie's ceiling.
  // LayersPanel (left of toolbar) and any future non-right-docking panels must NOT be included here.
  const hasRightPanels = $derived($activePanel !== null)

  // Panel IDs of all currently-visible right-docking panels
  const rightPanelIds = $derived.by(() => {
    const ids: string[] = []
    if ($activePanel === 'datasets') ids.push(...$activeDatasetPanelIds)
    else if ($activePanel === 'simulations') ids.push('simulations')
    else if ($activePanel) ids.push(`side:${$activePanel}`)
    return ids
  })

  // True when ALL visible right-docking panels are collapsed to header-only state
  const allRightPanelsCollapsed = $derived(
    rightPanelIds.length > 0 && rightPanelIds.every(id => Boolean($collapsedPanels[id]))
  )

  // The CSS subtraction term for the right-panel ceiling.
  // When panels are collapsed, accounts for the actual visual footprint of all stacked headers
  // (e.g. two collapsed DatasetList panels = 2×collapsed-height + 1×gap, not just 1×collapsed-height).
  function rightPanelCeilingPart(): string {
    if (!hasRightPanels) return ''
    if (!allRightPanelsCollapsed) return ' - var(--atlas-toolbar-natural-height)'
    // All panels collapsed — compute stacked header height
    if ($activePanel === 'datasets' && $activeDatasetPanelIds.length > 1) {
      const n = $activeDatasetPanelIds.length
      return ` - calc(${n} * var(--atlas-panel-collapsed-height) + ${n - 1} * var(--atlas-panel-gap))`
    }
    return ' - var(--atlas-panel-collapsed-height)'
  }

  // CSS calc string for the chat panel's max-height, accounting for right-panel state.
  // Uses CSS variables so the browser resolves clamp() values correctly.
  // layout-bottom-reserve = edge-gap + bottom-bar-height + panel-gap (the full bottom stack)
  function computeMaxHeightCSS(): string {
    return `calc(100dvh - var(--atlas-layout-top)${rightPanelCeilingPart()} - var(--atlas-panel-gap) - var(--atlas-layout-bottom-reserve))`
  }

  // Reactive version used in the initial style attribute
  const lurkieMaxHeight = $derived(computeMaxHeightCSS())

  // Collapse all visible right-docking panels to their header-only state
  function collapseRightPanels() {
    for (const id of rightPanelIds) {
      if (!$collapsedPanels[id]) togglePanelCollapsed(id)
    }
  }

  // Track loading transitions to trigger auto-collapse only after Lurkie responds
  let wasLoading = $state(false)

  // Chat states: 'collapsed' (icon only), 'expanded' (input bar), 'active' (chat + input)
  type ChatState = 'collapsed' | 'expanded' | 'active'
  let chatState = $state<ChatState>('collapsed')
  let chatPanelCollapsed = $state(false)
  let inputText = $state('')
  let messagesContainer: HTMLDivElement | undefined = $state(undefined)
  let inputEl: HTMLTextAreaElement | undefined = $state(undefined)

  // Independent element refs -- each Lurkie piece is positioned independently
  // so that state transitions never cause position drift (spec sections 8-9).
  let triggerEl: HTMLElement | undefined = $state(undefined)
  let inputBarEl: HTMLElement | undefined = $state(undefined)
  let chatPanelEl: HTMLElement | undefined = $state(undefined)

  // Position the chat panel above the input bar and enforce the correct max-height.
  // Called on mount, on input bar resize, and when right-panel state changes.
  function applyChatPosition() {
    if (!chatPanelEl) return
    const inputBarHeight = inputBarEl?.getBoundingClientRect().height || 48
    chatPanelEl.style.left = 'var(--atlas-topbar-right-left)'
    chatPanelEl.style.top = ''
    chatPanelEl.style.bottom = `calc(var(--atlas-edge-gap) + ${inputBarHeight}px + var(--atlas-panel-gap))`
    chatPanelEl.style.right = 'var(--atlas-edge-gap)'
    // Override max-height with actual measured bar height (accounts for growing textarea)
    chatPanelEl.style.maxHeight = `calc(100dvh - var(--atlas-layout-top)${rightPanelCeilingPart()} - var(--atlas-panel-gap) - var(--atlas-edge-gap) - ${inputBarHeight}px - var(--atlas-panel-gap))`
  }

  $effect(() => {
    // Re-apply position on mount AND whenever right-panel ceiling changes.
    // Reading hasRightPanels/allRightPanelsCollapsed here makes the effect track them.
    void hasRightPanels
    void allRightPanelsCollapsed
    if (chatPanelEl) applyChatPosition()
  })

  // Re-position chat panel when input bar resizes (textarea auto-grow).
  $effect(() => {
    if (!inputBarEl) return
    const observer = new ResizeObserver(() => applyChatPosition())
    observer.observe(inputBarEl)
    return () => observer.disconnect()
  })

  // Auto-collapse right-docking panels when Lurkie's response fills the available space.
  $effect(() => {
    const loading = $chatLoading
    if (loading) { wasLoading = true; return }
    if (!wasLoading || !$hasMessages) return
    wasLoading = false

    // Runs after Lurkie responds; tick ensures the DOM reflects the new message
    tick().then(() => {
      if (!messagesContainer || !hasRightPanels || allRightPanelsCollapsed) return
      // The messages div has overflow-y-auto — if it's scrolling, the panel is at max-height
      // and content has overflowed the available space → collapse right panels to free room
      if (messagesContainer.scrollHeight > messagesContainer.clientHeight + 4) {
        collapseRightPanels()
      }
    })
  })

  // Auto-scroll messages to bottom
  $effect(() => {
    if ($chatMessages.length > 0) {
      tick().then(scrollToBottom)
    }
  })

  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight
    }
  }

  let triggerFlash = $state(false)

  function handleTriggerClick() {
    if (chatState === 'collapsed') {
      triggerFlash = true
      setTimeout(() => {
        triggerFlash = false
        chatState = $hasMessages ? 'active' : 'expanded'
        tick().then(() => {
          if (inputEl) inputEl.focus()
        })
      }, 150)
    }
  }

  function handleSend() {
    const text = inputText.trim()
    if (!text || $chatLoading) return

    addUserMessage(text)
    chatService.sendMessage(text)
    inputText = ''

    if (chatState === 'expanded') {
      chatState = 'active'
    }

    tick().then(() => {
      if (inputEl) inputEl.focus()
    })
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      collapse()
    }
  }

  function collapse() {
    chatState = 'collapsed'
    inputText = ''
  }


  function handleNewChat() {
    clearChat()
    chatService.newChat()
    chatState = 'expanded'
    tick().then(() => {
      if (inputEl) inputEl.focus()
    })
  }

  function handleResize() {
    applyChatPosition()
  }

  onMount(() => {
    chatService.connect()
    window.addEventListener('resize', handleResize)
  })

  onDestroy(() => {
    chatService.disconnect()
    window.removeEventListener('resize', handleResize)
  })
</script>

<!-- Chat panel: fixed and anchored above the input bar -->
{#if chatState === 'active'}
  <div
    bind:this={chatPanelEl}
    class="glass-lurkie-panel fixed z-30
      flex flex-col animate-chat-in"
    style="bottom: calc(var(--atlas-edge-gap) + var(--atlas-bottom-bar-height) + var(--atlas-panel-gap)); left: var(--atlas-topbar-right-left); right: var(--atlas-edge-gap); max-height: {lurkieMaxHeight}; position: fixed !important;"
  >
    <!-- Chat header -->
    <div
      class="flex items-center justify-between px-[var(--atlas-panel-padding)] pt-[clamp(10px,0.97vh,14px)] pb-[clamp(6px,0.69vh,8px)]"
    >
      <div class="shrink-0">
        <span class="text-[var(--atlas-body-text-size)] font-semibold text-dtcc-dark">Lurkie</span>
      </div>
      {#if $chatLoading}
        <div class="flex-1 min-w-0 mx-3 flex flex-col items-start gap-0.5">
          <span class="font-medium tracking-wide transition-opacity duration-300 truncate w-full text-left" style="font-size: 13px; color: #c44d18; opacity: {lurkieLabelFaded ? 0 : 1};">{lurkieLabel}</span>
          <div class="h-1 w-full rounded-full bg-black/5 overflow-hidden">
            <div class="h-full w-1/3 rounded-full animate-lurkie-progress" style="background: #c44d18;"></div>
          </div>
        </div>
      {/if}
      <div class="flex gap-1 shrink-0">
        <button
          class="w-[var(--atlas-panel-action-size)] h-[var(--atlas-panel-action-size)] flex items-center justify-center rounded-lg cursor-pointer
            text-[#5F5F6D] hover:bg-black/5 transition-colors
            focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
          onclick={() => { chatPanelCollapsed = !chatPanelCollapsed }}
          aria-label={chatPanelCollapsed ? 'Expand chat panel' : 'Collapse chat panel'}
          aria-expanded={!chatPanelCollapsed}
        >
          <span
            class="w-[var(--atlas-panel-action-icon-size)] h-[var(--atlas-panel-action-icon-size)] inline-flex items-center justify-center transition-transform duration-200"
            class:rotate-180={chatPanelCollapsed}
          >
            {@html Icons.chevronDown}
          </span>
        </button>
        <button
          class="w-[var(--atlas-panel-action-size)] h-[var(--atlas-panel-action-size)] flex items-center justify-center rounded-lg cursor-pointer
            text-[#5F5F6D] hover:bg-black/5 transition-colors
            focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
          title="New chat"
          onclick={handleNewChat}
        >
          <span class="w-[var(--atlas-panel-action-icon-size)] h-[var(--atlas-panel-action-icon-size)] inline-flex items-center justify-center">{@html `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>`}</span>
        </button>
        <button
          class="w-[var(--atlas-panel-action-size)] h-[var(--atlas-panel-action-size)] flex items-center justify-center rounded-lg cursor-pointer
            text-[#5F5F6D] hover:bg-black/5 transition-colors
            focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
          title="Close"
          onclick={collapse}
        >
          <span class="w-[var(--atlas-panel-action-icon-size)] h-[var(--atlas-panel-action-icon-size)] inline-flex items-center justify-center">{@html Icons.close}</span>
        </button>
      </div>
    </div>

    <!-- Messages area -->
    {#if !chatPanelCollapsed}
      <div bind:this={messagesContainer} transition:slide={{ duration: 200 }} class="flex-1 overflow-y-auto px-[var(--atlas-panel-padding)] py-[clamp(6px,0.69vh,10px)] space-y-[clamp(10px,1.11vh,12px)] scrollbar-subtle" role="log" aria-live="polite">
      {#each $chatMessages as msg, i}
        {@const isStreaming = $chatLoading && i === $chatMessages.length - 1 && msg.role === 'assistant'}
        <div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
          <div
            class="max-w-[85%] rounded-xl px-[var(--atlas-card-padding-x)] py-[clamp(8px,0.83vh,10px)] font-light
              {msg.role === 'user' ? 'opacity-50 text-dtcc-dark' : 'text-dtcc-dark'}"
            style="font-size: var(--atlas-helper-font-size); line-height: var(--atlas-helper-line-height);">
            {#if isStreaming}
              <div class="whitespace-pre-wrap break-words">{msg.content}</div>
            {:else}
              <div class="chat-markdown break-words">{@html renderMarkdown(msg.content)}</div>
            {/if}
            {#if msg.toolCalls.some(tc => tc.status === 'running')}
              <div class="mt-1.5 pt-1.5 border-t border-black/10">
                <div class="text-xs text-dtcc-muted flex items-center gap-1">
                  <span class="animate-spin inline-block w-3 h-3 border border-dtcc-muted border-t-transparent rounded-full"></span>
                  <span>Analyzing...</span>
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/each}

      {#if $chatError}
        <div class="text-[var(--atlas-caption-text-size)] text-red-600 bg-red-50 rounded px-3 py-2">{$chatError}</div>
      {/if}
      </div>
    {/if}
  </div>
{/if}

<!-- Trigger capsule: fixed bottom-right, independent positioning (never moves) -->
{#if chatState === 'collapsed'}
  <button
    bind:this={triggerEl}
    class="glass-lurkie-panel fixed z-30 w-[var(--atlas-sidebar-width)] h-[var(--atlas-bottom-bar-height)] flex items-center justify-center
      hover:bg-black/5 transition-all duration-200 ease-out cursor-pointer"
    style="bottom: var(--atlas-edge-gap); right: var(--atlas-edge-gap); position: fixed !important;"
    style:--stroke-0={triggerFlash ? '#E35A1D' : undefined}
    onclick={handleTriggerClick}
    aria-label="Open Lurkie chat"
  >
    <span class="w-6 h-6 block text-dtcc-muted">{@html Icons.chat}</span>
  </button>
{/if}

<!-- Input bar: fixed bottom-right, independent positioning (never moves) -->
{#if chatState !== 'collapsed'}
  <div
    bind:this={inputBarEl}
    class="glass-lurkie-capsule fixed z-30 h-[var(--atlas-bottom-bar-height)] flex items-center gap-2
      pl-[clamp(10px,0.83vw,12px)] pr-[calc(var(--atlas-bottom-bar-height)*0.11)] py-0
      animate-expand-in"
    style="bottom: var(--atlas-edge-gap); left: var(--atlas-topbar-right-left); right: var(--atlas-edge-gap); position: fixed !important;"
  >
    <textarea
      bind:this={inputEl}
      bind:value={inputText}
      onkeydown={handleKeydown}
      placeholder={$hasMessages ? 'Reply...' : 'Ask Lurkie to explore data'}
      rows="1"
      oninput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }}
      class="flex-1 resize-none bg-transparent text-dtcc-dark font-light
        placeholder:opacity-50 placeholder:text-dtcc-muted
        focus:outline-none py-0 lurkie-textarea self-center"
      style="font-size: clamp(12.5px, 0.92vw, 13.8px); line-height: 1.2;"
    ></textarea>
    <button
      onclick={handleSend}
      disabled={$chatLoading}
      class="w-[calc(var(--atlas-bottom-bar-height)*0.78)] h-[calc(var(--atlas-bottom-bar-height)*0.78)] shrink-0 flex items-center justify-center rounded-full
        transition-all duration-150 active:scale-95
        {inputText.trim()
          ? 'bg-dtcc-orange text-white cursor-pointer'
          : 'bg-black/5 text-dtcc-muted cursor-default'}"
      aria-label="Send message"
    >
      <span class="w-[71.8%] h-[71.8%] block">{@html Icons.sendArrow}</span>
    </button>
  </div>
{/if}

<style>
  .glass-lurkie-panel {
    position: relative;
    background: rgba(255, 255, 255, var(--glass-bg-opacity, 0.55));
    backdrop-filter: blur(var(--glass-blur, 4px)) saturate(var(--glass-saturate, 1.1));
    -webkit-backdrop-filter: blur(var(--glass-blur, 4px)) saturate(var(--glass-saturate, 1.1));
    border: 1px solid rgba(255, 255, 255, var(--glass-border-opacity, 0.5));
    box-shadow: 
      var(--glass-shadow-x, 0px) var(--glass-shadow-y, 3px) var(--glass-shadow-blur, 7px) rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      inset 0 -1px 0 rgba(255, 255, 255, 0.1);
    border-radius: var(--atlas-panel-radius);
    overflow: hidden;
  }

  .glass-lurkie-panel::before {
    content: '';
    position: absolute;
    inset: 0;
    padding: 2px;
    border-radius: inherit;
    background: radial-gradient(
      ellipse at 30px 0px, 
      rgba(255, 255, 255, var(--glass-edge-opacity, 0.25)) 0%, 
      rgba(255, 255, 255, calc(var(--glass-edge-opacity, 0.25) * 0.4)) 40%, 
      transparent 80%
    );
    -webkit-mask: 
      linear-gradient(#fff 0 0) content-box, 
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
    z-index: 50;
  }

  .glass-lurkie-capsule {
    position: relative;
    background: rgba(255, 255, 255, var(--glass-bg-opacity, 0.55));
    backdrop-filter: blur(var(--glass-blur, 4px)) saturate(var(--glass-saturate, 1.1));
    -webkit-backdrop-filter: blur(var(--glass-blur, 4px)) saturate(var(--glass-saturate, 1.1));
    border: 1px solid rgba(255, 255, 255, var(--glass-border-opacity, 0.5));
    box-shadow: 
      var(--glass-shadow-x, 0px) var(--glass-shadow-y, 3px) var(--glass-shadow-blur, 7px) rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      inset 0 -1px 0 rgba(255, 255, 255, 0.1);
    border-radius: 999px;
    overflow: hidden;
  }

  .glass-lurkie-capsule::before {
    content: '';
    position: absolute;
    inset: 0;
    padding: 2px;
    border-radius: inherit;
    background: radial-gradient(
      ellipse at 30px 0px, 
      rgba(255, 255, 255, var(--glass-edge-opacity, 0.25)) 0%, 
      rgba(255, 255, 255, calc(var(--glass-edge-opacity, 0.25) * 0.4)) 40%, 
      transparent 80%
    );
    -webkit-mask: 
      linear-gradient(#fff 0 0) content-box, 
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
    z-index: 50;
  }

  /* Auto-resize textarea using field-sizing (modern browsers) */
  .lurkie-textarea {
    overflow: hidden;
    max-height: 26vh;
  }

  /* Chat panel fade-in animation. */
  @keyframes chat-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .animate-chat-in {
    animation: chat-in 200ms ease-out;
  }

  /* Input bar expand animation */
  @keyframes expand-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .animate-expand-in {
    animation: expand-in 200ms ease-out;
  }

  /* Markdown rendering within chat bubbles */
  .chat-markdown :global(p) {
    margin: 0;
  }
  .chat-markdown :global(p + p) {
    margin-top: 0.5em;
  }
  .chat-markdown :global(strong) {
    font-weight: 600;
  }
  .chat-markdown :global(code) {
    font-size: 0.85em;
    background: rgba(0, 0, 0, 0.06);
    padding: 0.1em 0.35em;
    border-radius: 4px;
  }
  .chat-markdown :global(pre) {
    background: rgba(0, 0, 0, 0.06);
    padding: 0.5em 0.75em;
    border-radius: 6px;
    overflow-x: auto;
    margin: 0.4em 0;
  }
  .chat-markdown :global(pre code) {
    background: none;
    padding: 0;
  }
  .chat-markdown :global(ul), .chat-markdown :global(ol) {
    margin: 0.3em 0;
    padding-left: 1.4em;
  }
  .chat-markdown :global(a) {
    color: #E35A1D;
    text-decoration: underline;
  }
  @keyframes lurkie-progress {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(400%); }
  }
  .animate-lurkie-progress {
    animation: lurkie-progress 1.5s ease-in-out infinite;
  }
</style>
