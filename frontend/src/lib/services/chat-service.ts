/**
 * WebSocket client for agent chat, following JobService reconnect pattern.
 */

import { get } from 'svelte/store'
import { API_BASE_URL } from '../config'
import { sessionId } from '../stores/session'
import { bbox } from '../stores/map'
import { selectedDataset } from '../stores/datasets'
import {
  chatLoading,
  chatConnected,
  chatError,
  addAssistantChunk,
  addToolCall,
} from '../stores/chat-store'

class ChatService {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private isConnecting = false
  private initialized = false

  connect(): void {
    if (this.ws || this.isConnecting) return
    this.isConnecting = true
    this.reconnectAttempts = 0

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}${API_BASE_URL}/agent/chat`
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        this.isConnecting = false
        this.reconnectAttempts = 0
        chatConnected.set(true)

        const sid = get(sessionId)
        this.ws?.send(JSON.stringify({
          type: 'init',
          session_id: sid || 'anonymous',
        }))
        this.initialized = true
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handleMessage(data)
        } catch {
          console.warn('Failed to parse chat message:', event.data)
        }
      }

      this.ws.onerror = () => {
        this.isConnecting = false
        chatConnected.set(false)
      }

      this.ws.onclose = () => {
        this.ws = null
        this.initialized = false
        chatConnected.set(false)
        this.handleReconnect()
      }
    } catch {
      this.isConnecting = false
      this.handleReconnect()
    }
  }

  private handleMessage(data: { type: string; content?: string; name?: string; status?: string; session_id?: string }): void {
    switch (data.type) {
      case 'session':
        break
      case 'status':
        chatLoading.set(data.content === 'thinking')
        break
      case 'text':
        chatLoading.set(false)
        if (data.content) addAssistantChunk(data.content)
        break
      case 'tool_call':
        if (data.name && data.status) {
          addToolCall(data.name, data.status as 'running' | 'complete')
        }
        break
      case 'error':
        chatLoading.set(false)
        chatError.set(data.content || 'Unknown error')
        break
      case 'done':
        chatLoading.set(false)
        break
      case 'keepalive':
        break
    }
  }

  sendMessage(content: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.initialized) {
      chatError.set('Not connected. Please wait...')
      return
    }

    chatError.set(null)
    const currentBbox = get(bbox)
    const currentDataset = get(selectedDataset)

    this.ws.send(JSON.stringify({
      type: 'message',
      content,
      context: {
        bbox: currentBbox ? [currentBbox.minX, currentBbox.minY, currentBbox.maxX, currentBbox.maxY] : null,
        activeDataset: currentDataset?.name || null,
      },
    }))
  }

  newChat(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'new_chat' }))
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
      setTimeout(() => this.connect(), delay)
    }
  }

  disconnect(): void {
    this.reconnectAttempts = this.maxReconnectAttempts
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.initialized = false
    chatConnected.set(false)
  }
}

export const chatService = new ChatService()
