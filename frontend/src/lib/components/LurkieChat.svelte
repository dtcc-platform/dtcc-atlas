<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte'
  import { Marked } from 'marked'
  import DOMPurify from 'dompurify'
  import { Icons } from '../ui/icons'
  import { chatMessages, chatLoading, chatError, addUserMessage, clearChat, hasMessages } from '../stores/chat-store'
  import { chatService } from '../services/chat-service'

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

  // Chat states: 'collapsed' (icon only), 'expanded' (input bar), 'active' (chat + input)
  type ChatState = 'collapsed' | 'expanded' | 'active'
  let chatState = $state<ChatState>('collapsed')
  let inputText = $state('')
  let messagesContainer: HTMLDivElement
  let inputEl: HTMLTextAreaElement

  // Independent element refs -- each Lurkie piece is positioned independently
  // so that state transitions never cause position drift (spec sections 8-9).
  let triggerEl: HTMLElement
  let inputBarEl: HTMLElement
  let chatPanelEl: HTMLElement

  // Drag state -- only affects the chat panel, never the trigger or input bar.
  let dragOffset = $state<{ x: number; y: number } | null>(null)
  let dragging = $state(false)
  let dragPos = $state<{ x: number; y: number } | null>(null)

  // Reset drag position when leaving active state so the chat panel
  // returns to its default anchor above the input bar next time it opens.
  $effect(() => {
    if (chatState !== 'active') {
      dragPos = null
    }
  })

  // Responsive scaling factor (shared formula with other floating panels).
  function getScale(): number {
    const topOffset = 77
    const bottomMargin = 16
    const available = window.innerHeight - topOffset - bottomMargin
    return Math.min(1, available / 633)
  }

  // Apply fixed bottom-right position with responsive scaling.
  // Used for both the trigger capsule and the input bar.
  function applyBottomRight(el: HTMLElement | undefined) {
    if (!el) return
    const scale = getScale()
    const margin = 16 * scale
    el.style.bottom = `${margin}px`
    el.style.right = `${margin}px`
    el.style.transform = `scale(${scale})`
    el.style.transformOrigin = 'bottom right'
  }

  // Position the chat panel above the input bar (or at dragged position).
  function applyChatPosition() {
    if (!chatPanelEl) return
    if (dragPos) {
      const w = chatPanelEl.offsetWidth || 360
      const h = chatPanelEl.offsetHeight || 100
      const x = Math.max(0, Math.min(window.innerWidth - w, dragPos.x))
      const y = Math.max(0, Math.min(window.innerHeight - h, dragPos.y))
      chatPanelEl.style.bottom = 'auto'
      chatPanelEl.style.right = 'auto'
      chatPanelEl.style.left = `${x}px`
      chatPanelEl.style.top = `${y}px`
      chatPanelEl.style.transform = ''
      chatPanelEl.style.transformOrigin = ''
    } else {
      const scale = getScale()
      const margin = 16 * scale
      // Measure the input bar's visual height so the chat panel sits directly above it.
      const inputBarHeight = inputBarEl?.getBoundingClientRect().height || 48 * scale
      const gap = 8 * scale
      chatPanelEl.style.left = ''
      chatPanelEl.style.top = ''
      chatPanelEl.style.bottom = `${margin + inputBarHeight + gap}px`
      chatPanelEl.style.right = `${margin}px`
      chatPanelEl.style.transform = `scale(${scale})`
      chatPanelEl.style.transformOrigin = 'bottom right'
    }
  }

  // Positioning effects -- each element is tracked independently.
  $effect(() => {
    if (triggerEl) applyBottomRight(triggerEl)
  })

  $effect(() => {
    if (inputBarEl) applyBottomRight(inputBarEl)
  })

  $effect(() => {
    // applyChatPosition reads dragPos internally, which registers tracking.
    if (chatPanelEl) applyChatPosition()
  })

  // Re-position chat panel when input bar resizes (textarea auto-grow).
  $effect(() => {
    if (!inputBarEl) return
    const observer = new ResizeObserver(() => applyChatPosition())
    observer.observe(inputBarEl)
    return () => observer.disconnect()
  })

  // Drag handlers -- only for the chat panel header.
  function handleDragStart(e: MouseEvent) {
    if (!chatPanelEl) return
    const rect = chatPanelEl.getBoundingClientRect()
    dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    dragging = true
    e.preventDefault()
  }

  function handleDragMove(e: MouseEvent) {
    if (!dragging || !dragOffset) return
    dragPos = {
      x: Math.max(0, Math.min(window.innerWidth - (chatPanelEl?.offsetWidth || 360), e.clientX - dragOffset.x)),
      y: Math.max(0, Math.min(window.innerHeight - (chatPanelEl?.offsetHeight || 100), e.clientY - dragOffset.y)),
    }
  }

  function handleDragEnd() {
    dragging = false
    dragOffset = null
  }

  // Transition to active state when messages exist
  $effect(() => {
    if ($hasMessages && chatState === 'expanded') {
      chatState = 'active'
    }
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

  // Click-outside detection checks all three independent elements.
  function handleClickOutside(e: MouseEvent) {
    if (chatState === 'collapsed') return
    const target = e.target as Node
    if (
      triggerEl?.contains(target) ||
      inputBarEl?.contains(target) ||
      chatPanelEl?.contains(target)
    ) return
    collapse()
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
    applyBottomRight(triggerEl)
    applyBottomRight(inputBarEl)
    applyChatPosition()
  }

  onMount(() => {
    chatService.connect()
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('mousemove', handleDragMove, { passive: true })
    document.addEventListener('mouseup', handleDragEnd)
    window.addEventListener('resize', handleResize)
  })

  onDestroy(() => {
    chatService.disconnect()
    document.removeEventListener('mousedown', handleClickOutside)
    document.removeEventListener('mousemove', handleDragMove)
    document.removeEventListener('mouseup', handleDragEnd)
    window.removeEventListener('resize', handleResize)
  })
</script>

<!-- Chat panel: fixed, positioned above input bar, draggable independently -->
{#if chatState === 'active'}
  <div
    bind:this={chatPanelEl}
    class="fixed z-30 w-[360px] bg-white/50 backdrop-blur-xl border border-white/20
      shadow-[0_0_30px_rgba(255,255,255,0.15)] rounded-[25px]
      flex flex-col overflow-hidden animate-chat-in"
    style="bottom: 72px; right: 16px; max-height: calc(100vh - 200px);"
  >
    <!-- Chat header (drag handle) -->
    <div
      class="flex items-center justify-between px-5 pt-4 pb-2"
      class:cursor-grab={!dragging}
      class:cursor-grabbing={dragging}
      onmousedown={handleDragStart}
      role="toolbar"
      tabindex="-1"
      aria-label="Drag to reposition"
    >
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-dtcc-dark">Lurkie</span>
      </div>
      {#if $chatLoading}
        <div class="flex-1 mx-3 flex flex-col items-center gap-0.5">
          <span class="text-[10px] font-medium tracking-wide transition-opacity duration-300" style="color: #c44d18; opacity: {lurkieLabelFaded ? 0 : 1};">{lurkieLabel}</span>
          <div class="h-1 w-full rounded-full bg-black/5 overflow-hidden">
            <div class="h-full w-1/3 rounded-full animate-lurkie-progress" style="background: #c44d18;"></div>
          </div>
        </div>
      {/if}
      <div class="flex gap-1">
        <button
          class="p-1.5 rounded-md hover:bg-black/5 text-dtcc-muted transition-colors"
          title="New chat"
          onclick={handleNewChat}
        >
          <span class="w-4 h-4 block">{@html `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>`}</span>
        </button>
        <button
          class="p-1.5 rounded-md hover:bg-black/5 text-dtcc-muted transition-colors"
          title="Close"
          onclick={collapse}
        >
          <span class="w-4 h-4 block">{@html Icons.close}</span>
        </button>
      </div>
    </div>

    <!-- Messages area -->
    <div bind:this={messagesContainer} class="flex-1 overflow-y-auto px-5 py-2 space-y-3 scrollbar-subtle" role="log" aria-live="polite">
      {#each $chatMessages as msg, i}
        {@const isStreaming = $chatLoading && i === $chatMessages.length - 1 && msg.role === 'assistant'}
        <div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
          <div class="max-w-[85%] rounded-xl px-3 py-2 text-sm
            {msg.role === 'user'
              ? 'opacity-50 text-dtcc-dark'
              : 'text-dtcc-dark'}">
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
        <div class="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{$chatError}</div>
      {/if}
    </div>
  </div>
{/if}

<!-- Trigger capsule: fixed bottom-right, independent positioning (never moves) -->
{#if chatState === 'collapsed'}
  <button
    bind:this={triggerEl}
    class="fixed z-30 w-[75px] h-[49px] flex items-center justify-center
      bg-white/50 backdrop-blur-xl border border-white/20
      shadow-[0_0_30px_rgba(255,255,255,0.15)] rounded-[25px]
      hover:bg-black/5 transition-all duration-200 ease-out cursor-pointer"
    style="bottom: 16px; right: 16px;"
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
    class="fixed z-30 w-[360px] h-auto flex items-end gap-2
      bg-white/50 backdrop-blur-xl border border-white/20
      shadow-[0_0_30px_rgba(255,255,255,0.15)] rounded-[25px]
      px-4 py-[6px]
      animate-expand-in"
    style="bottom: 16px; right: 16px;"
  >
    <textarea
      bind:this={inputEl}
      bind:value={inputText}
      onkeydown={handleKeydown}
      placeholder={$hasMessages ? 'Reply...' : 'Ask Lurkie about data, tools, or workflows'}
      rows="1"
      class="flex-1 resize-none bg-transparent text-sm text-dtcc-dark
        placeholder:opacity-50 placeholder:text-dtcc-muted
        focus:outline-none py-2 leading-snug lurkie-textarea"
    ></textarea>
    <button
      onclick={handleSend}
      disabled={$chatLoading}
      class="w-9 h-9 shrink-0 flex items-center justify-center rounded-full
        transition-all duration-150 active:scale-95 mb-[2px]
        {inputText.trim()
          ? 'bg-dtcc-orange text-white cursor-pointer'
          : 'bg-black/5 text-dtcc-muted cursor-default'}"
      aria-label="Send message"
    >
      <span class="w-5 h-5 block">{@html Icons.sendArrow}</span>
    </button>
  </div>
{/if}

<style>
  /* Auto-resize textarea using field-sizing (modern browsers) */
  .lurkie-textarea {
    field-sizing: content;
    min-height: 36px;
    max-height: 30vh;
  }

  /* Chat panel slide-in animation */
  @keyframes chat-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-chat-in {
    animation: chat-in 200ms ease-out;
  }

  /* Input bar expand animation */
  @keyframes expand-in {
    from { opacity: 0; width: 75px; }
    to { opacity: 1; width: 360px; }
  }
  .animate-expand-in {
    animation: expand-in 200ms ease-out;
  }

  /* Scrollbar styling */
  .scrollbar-subtle::-webkit-scrollbar {
    width: 4px;
  }
  .scrollbar-subtle::-webkit-scrollbar-track {
    background: transparent;
  }
  .scrollbar-subtle::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 2px;
  }
  .scrollbar-subtle:hover::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.2);
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
