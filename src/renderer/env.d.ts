interface ArcAPI {
  conversations: {
    create: (title: string) => Promise<import('../main/conversations').Conversation>
    list: () => Promise<import('../main/conversations').Conversation[]>
    get: (id: string) => Promise<import('../main/conversations').Conversation | undefined>
  }
  chat: {
    send: (conversationId: string, message: string) => Promise<void>
    onChunk: (cb: (data: { conversationId: string; chunk: string }) => void) => () => void
    onDone: (cb: (data: { conversationId: string }) => void) => () => void
  }
  ollama: {
    status: () => Promise<{ running: boolean }>
  }
}

declare global {
  interface Window {
    arc: ArcAPI
  }
}

export {}
