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
  let messagesContainer: HTMLDivElement | undefined = $state(undefined)
  let inputEl: HTMLTextAreaElement | undefined = $state(undefined)

  // Independent element refs -- each Lurkie piece is positioned independently
  // so that state transitions never cause position drift (spec sections 8-9).
  let triggerEl: HTMLElement | undefined = $state(undefined)
  let inputBarEl: HTMLElement | undefined = $state(undefined)
  let chatPanelEl: HTMLElement | undefined = $state(undefined)

  // Position the chat panel above the input bar.
  function applyChatPosition() {
    if (!chatPanelEl) return
    const inputBarHeight = inputBarEl?.getBoundingClientRect().height || 48
    chatPanelEl.style.left = ''
    chatPanelEl.style.top = ''
    chatPanelEl.style.bottom = `calc(var(--atlas-edge-gap) + ${inputBarHeight}px + var(--atlas-panel-gap))`
    chatPanelEl.style.right = 'var(--atlas-edge-gap)'
  }

  $effect(() => {
    if (chatPanelEl) applyChatPosition()
  })

  // Re-position chat panel when input bar resizes (textarea auto-grow).
  $effect(() => {
    if (!inputBarEl) return
    const observer = new ResizeObserver(() => applyChatPosition())
    observer.observe(inputBarEl)
    return () => observer.disconnect()
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
    applyChatPosition()
  }

  onMount(() => {
    chatService.connect()
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('resize', handleResize)
  })

  onDestroy(() => {
    chatService.disconnect()
    document.removeEventListener('mousedown', handleClickOutside)
    window.removeEventListener('resize', handleResize)
  })
</script>

<!-- Chat panel: fixed and anchored above the input bar -->
{#if chatState === 'active'}
  <div
    bind:this={chatPanelEl}
    class="fixed z-30 w-[var(--atlas-panel-width)] bg-white/50 backdrop-blur-xl border border-white/20
      shadow-[0_0_30px_rgba(255,255,255,0.15)] rounded-[var(--atlas-panel-radius)]
      flex flex-col overflow-hidden animate-chat-in"
    style="bottom: calc(var(--atlas-edge-gap) + var(--atlas-bottom-bar-height) + var(--atlas-panel-gap)); right: var(--atlas-edge-gap); max-height: calc(100dvh - var(--atlas-layout-top) - var(--atlas-edge-gap) - var(--atlas-bottom-bar-height) - (var(--atlas-panel-gap) * 2));"
  >
    <!-- Chat header -->
    <div
      class="flex items-center justify-between px-[var(--atlas-panel-padding)] pt-[clamp(10px,0.97vh,14px)] pb-[clamp(6px,0.69vh,8px)]"
    >
      <div class="flex items-center gap-2">
        <span class="text-[var(--atlas-body-text-size)] font-semibold text-dtcc-dark">Lurkie</span>
      </div>
      {#if $chatLoading}
        <div class="flex-1 mx-3 flex flex-col items-center gap-0.5">
          <span class="text-[var(--atlas-caption-text-size)] font-medium tracking-wide transition-opacity duration-300" style="color: #c44d18; opacity: {lurkieLabelFaded ? 0 : 1};">{lurkieLabel}</span>
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
    <div bind:this={messagesContainer} class="flex-1 overflow-y-auto px-[var(--atlas-panel-padding)] py-[clamp(6px,0.69vh,10px)] space-y-[clamp(10px,1.11vh,12px)] scrollbar-subtle" role="log" aria-live="polite">
      {#each $chatMessages as msg, i}
        {@const isStreaming = $chatLoading && i === $chatMessages.length - 1 && msg.role === 'assistant'}
        <div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
          <div class="max-w-[85%] rounded-xl px-[var(--atlas-card-padding-x)] py-[clamp(8px,0.83vh,10px)] text-[var(--atlas-body-text-size)]
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
        <div class="text-[var(--atlas-caption-text-size)] text-red-600 bg-red-50 rounded px-3 py-2">{$chatError}</div>
      {/if}
    </div>
  </div>
{/if}

<!-- Trigger capsule: fixed bottom-right, independent positioning (never moves) -->
{#if chatState === 'collapsed'}
  <button
    bind:this={triggerEl}
    class="fixed z-30 w-[var(--atlas-sidebar-width)] h-[var(--atlas-bottom-bar-height)] flex items-center justify-center
      bg-white/50 backdrop-blur-xl border border-white/20
      shadow-[0_0_30px_rgba(255,255,255,0.15)] rounded-[var(--atlas-panel-radius)]
      hover:bg-black/5 transition-all duration-200 ease-out cursor-pointer"
    style="bottom: var(--atlas-edge-gap); right: var(--atlas-edge-gap);"
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
    class="fixed z-30 w-[var(--atlas-panel-width)] h-auto flex items-end gap-2
      bg-white/50 backdrop-blur-xl border border-white/20
      shadow-[0_0_30px_rgba(255,255,255,0.15)] rounded-[var(--atlas-panel-radius)]
      px-[clamp(10px,0.83vw,12px)] py-[clamp(5px,0.56vh,7px)]
      animate-expand-in"
    style="bottom: var(--atlas-edge-gap); right: var(--atlas-edge-gap);"
  >
    <textarea
      bind:this={inputEl}
      bind:value={inputText}
      onkeydown={handleKeydown}
      placeholder={$hasMessages ? 'Reply...' : 'Ask Lurkie about data, tools, or workflows'}
      rows="1"
      class="flex-1 resize-none bg-transparent text-[var(--atlas-body-text-size)] text-dtcc-dark
        placeholder:opacity-50 placeholder:text-dtcc-muted
        focus:outline-none py-2 leading-snug lurkie-textarea"
    ></textarea>
    <button
      onclick={handleSend}
      disabled={$chatLoading}
      class="w-[var(--atlas-chat-send-size)] h-[var(--atlas-chat-send-size)] shrink-0 flex items-center justify-center rounded-full
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
    from { opacity: 0; width: var(--atlas-sidebar-width); }
    to { opacity: 1; width: var(--atlas-panel-width); }
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
