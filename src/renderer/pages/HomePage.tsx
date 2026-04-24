import React, { useState, KeyboardEvent } from 'react'

interface Props {
  onSend: (text: string) => void
  disabled?: boolean
}

const QUICK_ACTIONS = [
  'Summarize a document',
  'Review a contract',
  'Draft a memo',
  'Explain a clause',
]

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function HomePage({ onSend, disabled }: Props) {
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
    <div className="flex-1 flex flex-col items-center justify-center px-8 pb-16">
      {/* Greeting */}
      <h1 className="text-[32px] font-semibold text-[#1a1a1a] mb-8 tracking-tight">
        {getGreeting()}
      </h1>

      {/* Chat input card — Claude desktop style */}
      <div className="w-full max-w-[680px]">
        <div className="bg-white border border-[#e0e0e0] rounded-2xl shadow-sm overflow-hidden">
          <textarea
            className="w-full px-5 pt-4 pb-2 text-[15px] text-[#1a1a1a] placeholder:text-[#bbb] resize-none outline-none bg-transparent leading-relaxed"
            placeholder="Ask anything about your documents..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            disabled={disabled}
          />
          <div className="flex items-center justify-between px-5 py-3 border-t border-[#f0f0f0]">
            {/* Attachment hint */}
            <button className="flex items-center gap-1.5 text-[12px] text-[#bbb] hover:text-[#888] transition-colors">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M10.5 6L6 10.5C4.895 11.605 3.105 11.605 2 10.5C0.895 9.395 0.895 7.605 2 6.5L7 1.5C7.828 0.672 9.172 0.672 10 1.5C10.828 2.328 10.828 3.672 10 4.5L5 9.5C4.586 9.914 3.914 9.914 3.5 9.5C3.086 9.086 3.086 8.414 3.5 8L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              Attach document
            </button>

            {/* Send */}
            <button
              onClick={handleSend}
              disabled={!value.trim() || disabled}
              className="w-8 h-8 rounded-full bg-[#1a1a1a] text-white flex items-center justify-center disabled:opacity-20 transition-opacity"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1v11M6.5 1L2 5.5M6.5 1L11 5.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Quick action chips */}
        <div className="flex flex-wrap gap-2 mt-3 justify-center">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action}
              onClick={() => onSend(action)}
              disabled={disabled}
              className="px-3.5 py-1.5 rounded-full text-[12px] text-[#555] border border-[#e0e0e0] bg-white hover:border-[#ccc] hover:text-[#1a1a1a] transition-colors disabled:opacity-40"
            >
              {action}
            </button>
          ))}
        </div>
      </div>

      {/* Privacy note */}
      <p className="mt-8 text-[11px] text-[#ccc] tracking-wide">
        Everything stays on your Mac · No internet required
      </p>
    </div>
  )
}
