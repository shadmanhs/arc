import React from 'react'
import { ChatMessage } from '../hooks/useChat'
import { MessageList } from '../components/MessageList'
import { ChatInput } from '../components/ChatInput'

interface Props {
  messages: ChatMessage[]
  isStreaming: boolean
  onSend: (text: string) => void
}

export function ChatPage({ messages, isStreaming, onSend }: Props) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <MessageList messages={messages} />
      <ChatInput onSend={onSend} disabled={isStreaming} />
    </div>
  )
}
