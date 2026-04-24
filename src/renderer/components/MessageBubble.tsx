import React from 'react'
import { ChatMessage } from '../hooks/useChat'

interface Props {
  message: ChatMessage
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
          isUser
            ? 'bg-[#1a1a1a] text-white'
            : 'bg-[#f4f4f4] text-[#1a1a1a]'
        }`}
      >
        {message.content}
        {message.streaming && (
          <span className="inline-block w-1.5 h-4 bg-current ml-0.5 animate-pulse align-middle" />
        )}
      </div>
    </div>
  )
}
