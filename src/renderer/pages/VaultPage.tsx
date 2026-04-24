import React from 'react'

export function VaultPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <div className="w-12 h-12 rounded-2xl bg-[#f4f4f4] flex items-center justify-center mb-4">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="1" y="3" width="20" height="16" rx="2.5" stroke="#aaa" strokeWidth="1.5"/>
          <path d="M1 8h20" stroke="#aaa" strokeWidth="1.5"/>
          <circle cx="11" cy="14" r="1.5" fill="#aaa"/>
        </svg>
      </div>
      <h2 className="text-[17px] font-semibold text-[#1a1a1a] mb-2">Document Vault</h2>
      <p className="text-[13px] text-[#999] max-w-xs leading-relaxed">
        Drop PDFs and Word documents here. Your AI will learn from them and can answer questions across all your files.
      </p>
      <button className="mt-6 px-5 py-2.5 rounded-xl bg-[#1a1a1a] text-white text-[13px] font-medium hover:opacity-80 transition-opacity">
        Add documents
      </button>
      <p className="mt-4 text-[11px] text-[#ccc]">Coming in Phase 2</p>
    </div>
  )
}
