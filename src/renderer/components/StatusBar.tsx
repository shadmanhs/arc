import React, { useEffect, useState } from 'react'

export function StatusBar() {
  const [ollamaRunning, setOllamaRunning] = useState(false)

  useEffect(() => {
    const check = async () => {
      try {
        const status = await window.arc.ollama.status()
        setOllamaRunning(status.running)
      } catch {
        setOllamaRunning(false)
      }
    }
    check()
    const interval = setInterval(check, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-center justify-between px-6 py-2 border-b border-[#f0f0f0] bg-white">
      <span className="text-[12px] font-medium text-[#1a1a1a] tracking-wide">Arc</span>
      <div className="flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full ${ollamaRunning ? 'bg-green-500' : 'bg-amber-400'}`} />
        <span className="text-[11px] text-[#888]">
          {ollamaRunning ? 'Your AI is ready' : 'Starting AI...'}
        </span>
        <span className="text-[10px] text-[#bbb] ml-2">All data stays on your Mac</span>
      </div>
    </div>
  )
}
