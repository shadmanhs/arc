import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('arc', {
  conversations: {
    create: (title: string) => ipcRenderer.invoke('conversations:create', title),
    list: () => ipcRenderer.invoke('conversations:list'),
    get: (id: string) => ipcRenderer.invoke('conversations:get', id)
  },
  chat: {
    send: (conversationId: string, message: string) =>
      ipcRenderer.invoke('chat:send', { conversationId, message }),
    onChunk: (cb: (data: { conversationId: string; chunk: string }) => void) => {
      ipcRenderer.on('chat:chunk', (_event, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('chat:chunk')
    },
    onDone: (cb: (data: { conversationId: string }) => void) => {
      ipcRenderer.on('chat:done', (_event, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('chat:done')
    }
  },
  ollama: {
    status: () => ipcRenderer.invoke('ollama:status')
  }
})
