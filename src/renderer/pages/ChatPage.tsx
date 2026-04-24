import React from 'react'
import { useChat } from '../hooks/useChat'
import { MessageList } from '../components/MessageList'
import { ChatInput } from '../components/ChatInput'

export function ChatPage() {
  const { messages, isStreaming, sendMessage } = useChat()

  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages} />
      <ChatInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  )
}
