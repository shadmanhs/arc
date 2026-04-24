import { ipcMain } from 'electron'
import { OllamaManager } from './ollama'
import { ConversationStore, Message } from './conversations'

export function registerIpcHandlers(
  ollama: OllamaManager,
  conversations: ConversationStore
): void {
  // Create a new conversation
  ipcMain.handle('conversations:create', (_event, title: string) => {
    return conversations.create(title)
  })

  // List all conversations
  ipcMain.handle('conversations:list', () => {
    return conversations.list()
  })

  // Get a single conversation
  ipcMain.handle('conversations:get', (_event, id: string) => {
    return conversations.get(id)
  })

  // Stream a chat message — sends chunks back via webContents.send
  ipcMain.handle(
    'chat:send',
    async (event, { conversationId, message }: { conversationId: string; message: string }) => {
      const userMsg: Message = {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      }
      conversations.appendMessage(conversationId, userMsg)

      const conv = conversations.get(conversationId)!
      const messages = conv.messages.map((m) => ({ role: m.role, content: m.content }))

      const res = await fetch(`${ollama.getBaseUrl()}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen2.5:7b',
          messages,
          stream: true
        })
      })

      if (!res.ok || !res.body) {
        throw new Error(`Ollama request failed: ${res.status}`)
      }

      let fullResponse = ''
      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = decoder.decode(value).split('\n').filter(Boolean)
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line)
            const chunk = parsed.message?.content ?? ''
            fullResponse += chunk
            event.sender.send('chat:chunk', { conversationId, chunk })
          } catch {
            // malformed chunk — skip
          }
        }
      }

      const assistantMsg: Message = {
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date().toISOString()
      }
      conversations.appendMessage(conversationId, assistantMsg)
      event.sender.send('chat:done', { conversationId })
    }
  )

  // Get Ollama status
  ipcMain.handle('ollama:status', () => ({
    running: ollama.isRunning()
  }))
}
