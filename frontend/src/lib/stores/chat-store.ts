import { writable, derived } from 'svelte/store'

export interface ToolCall {
  name: string
  status: 'running' | 'complete'
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls: ToolCall[]
  timestamp: number
}

export const chatMessages = writable<ChatMessage[]>([])
export const chatLoading = writable(false)
export const chatConnected = writable(false)
export const chatError = writable<string | null>(null)

export const hasMessages = derived(chatMessages, $msgs => $msgs.length > 0)

export function addUserMessage(content: string): void {
  chatMessages.update(msgs => [
    ...msgs,
    { role: 'user', content, toolCalls: [], timestamp: Date.now() },
  ])
}

export function addAssistantChunk(text: string): void {
  chatMessages.update(msgs => {
    const last = msgs[msgs.length - 1]
    if (last && last.role === 'assistant') {
      const updated = [...msgs]
      updated[updated.length - 1] = { ...last, content: last.content + text }
      return updated
    }
    return [...msgs, { role: 'assistant', content: text, toolCalls: [], timestamp: Date.now() }]
  })
}

export function addToolCall(name: string, status: 'running' | 'complete'): void {
  chatMessages.update(msgs => {
    const last = msgs[msgs.length - 1]
    if (last && last.role === 'assistant') {
      const updated = [...msgs]
      const toolCalls = [...last.toolCalls]
      const existing = toolCalls.findIndex(tc => tc.name === name)
      if (existing >= 0) {
        toolCalls[existing] = { name, status }
      } else {
        toolCalls.push({ name, status })
      }
      updated[updated.length - 1] = { ...last, toolCalls }
      return updated
    }
    return msgs
  })
}

export function clearChat(): void {
  chatMessages.set([])
  chatError.set(null)
}
