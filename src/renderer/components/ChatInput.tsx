import React, { useState, KeyboardEvent } from 'react'

interface Props {
  onSend: (text: string) => void
  disabled?: boolean
}

export function ChatInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState('')

  const handleSend = () => {
    const text = value.trim()
    if (!text || disabled) return
    onSend(text)
    setValue('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-[#f0f0f0] px-6 py-4 bg-white">
      <div className="flex items-end gap-3 bg-[#f7f7f5] rounded-2xl border border-[#e8e8e6] px-4 py-3">
        <textarea
          className="flex-1 bg-transparent resize-none outline-none text-[15px] text-[#1a1a1a] placeholder:text-[#aaa] max-h-40 min-h-[24px]"
          placeholder="Ask anything..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
        />
        <button
          onClick={handleSend}
          disabled={!value.trim() || disabled}
          className="w-8 h-8 rounded-full bg-[#1a1a1a] text-white flex items-center justify-center disabled:opacity-30 flex-shrink-0 transition-opacity"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1L7 13M7 1L2 6M7 1L12 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
