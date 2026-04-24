import React from 'react'

export function MeetingsPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <div className="w-12 h-12 rounded-2xl bg-[#f4f4f4] flex items-center justify-center mb-4">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="11" r="8.5" stroke="#aaa" strokeWidth="1.5"/>
          <path d="M11 6v5l3 2" stroke="#aaa" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <h2 className="text-[17px] font-semibold text-[#1a1a1a] mb-2">Meeting Notes</h2>
      <p className="text-[13px] text-[#999] max-w-xs leading-relaxed">
        Record any meeting — in person or on Zoom — and get a private, local transcript and summary automatically.
      </p>
      <button className="mt-6 px-5 py-2.5 rounded-xl bg-[#f4f4f4] text-[#1a1a1a] text-[13px] font-medium border border-[#e0e0e0] hover:bg-[#eee] transition-colors flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
        Start recording
      </button>
      <p className="mt-4 text-[11px] text-[#ccc]">Coming in Phase 3</p>
    </div>
  )
}
