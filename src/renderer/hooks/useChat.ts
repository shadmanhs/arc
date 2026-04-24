import { useState, useEffect, useCallback, useRef } from 'react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const cleanupRef = useRef<(() => void)[]>([])

  useEffect(() => {
    const removeChunk = window.arc.chat.onChunk(({ chunk }) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.streaming) {
          return [...prev.slice(0, -1), { ...last, content: last.content + chunk }]
        }
        return prev
      })
    })

    const removeDone = window.arc.chat.onDone(() => {
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.streaming) {
          return [...prev.slice(0, -1), { ...last, streaming: false }]
        }
        return prev
      })
      setIsStreaming(false)
    })

    cleanupRef.current = [removeChunk, removeDone]
    return () => cleanupRef.current.forEach((fn) => fn())
  }, [])

  const sendMessage = useCallback(
    async (text: string) => {
      if (isStreaming) return

      let convId = conversationId
      if (!convId) {
        const conv = await window.arc.conversations.create('New Chat')
        convId = conv.id
        setConversationId(convId)
      }

      const userMsg: ChatMessage = {
        id: `${Date.now()}-user`,
        role: 'user',
        content: text
      }
      const assistantPlaceholder: ChatMessage = {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        content: '',
        streaming: true
      }

      setMessages((prev) => [...prev, userMsg, assistantPlaceholder])
      setIsStreaming(true)

      await window.arc.chat.send(convId, text)
    },
    [conversationId, isStreaming]
  )

  const newConversation = useCallback(() => {
    setMessages([])
    setConversationId(null)
    setIsStreaming(false)
  }, [])

  return { messages, conversationId, isStreaming, sendMessage, newConversation }
}
