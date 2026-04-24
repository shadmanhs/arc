import React, { useEffect, useRef } from 'react'
import { ChatMessage } from '../hooks/useChat'
import { MessageBubble } from './MessageBubble'

interface Props {
  messages: ChatMessage[]
}

export function MessageList({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 max-w-[760px] mx-auto w-full">
      {messages.length === 0 && (
        <div className="flex items-center justify-center h-full text-[#999] text-[15px]">
          Ask anything — your conversation stays on this Mac
        </div>
      )}
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
