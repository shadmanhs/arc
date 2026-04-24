import React, { useState, useRef, useEffect } from 'react'

interface Props {
  onOpenSettings: () => void
}

export function UserMenu({ onOpenSettings }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      {/* Popover */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-[220px] bg-white border border-[#e8e8e6] rounded-xl shadow-lg py-1.5 z-50">
          <div className="px-3 py-2 border-b border-[#f0f0f0] mb-1">
            <p className="text-[11px] text-[#aaa]">On this device</p>
          </div>

          <MenuItem
            icon={
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M1.5 12.5C1.5 10.015 4.015 8 7 8C9.985 8 12.5 10.015 12.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            }
            label="Settings"
            shortcut="⌘,"
            onClick={() => { setOpen(false); onOpenSettings() }}
            bold
          />
          <MenuItem
            icon={
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M7 6.5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <circle cx="7" cy="4" r="0.75" fill="currentColor"/>
              </svg>
            }
            label="About Arc"
            onClick={() => setOpen(false)}
          />

          <div className="border-t border-[#f0f0f0] mt-1 pt-1">
            <MenuItem
              icon={
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M5 7h4M7 5l2 2-2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              }
              label="Privacy guarantee"
              onClick={() => setOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px] text-[#555] hover:bg-[#ebebea] transition-colors"
      >
        <div className="w-6 h-6 rounded-full bg-[#1a1a1a] flex items-center justify-center flex-shrink-0">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="3.5" r="2" fill="white"/>
            <path d="M1 10.5C1 8.567 3.239 7 6 7C8.761 7 11 8.567 11 10.5" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </div>
        <span className="flex-1 text-left truncate">Account</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 4L5 1L8 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  )
}

function MenuItem({
  icon,
  label,
  shortcut,
  onClick,
  bold
}: {
  icon: React.ReactNode
  label: string
  shortcut?: string
  onClick: () => void
  bold?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[#1a1a1a] hover:bg-[#f4f4f4] transition-colors"
    >
      <span className="text-[#666] flex-shrink-0">{icon}</span>
      <span className={`flex-1 text-left ${bold ? 'font-medium' : ''}`}>{label}</span>
      {shortcut && <span className="text-[11px] text-[#bbb]">{shortcut}</span>}
    </button>
  )
}
