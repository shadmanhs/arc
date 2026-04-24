import React from 'react'

type View = 'home' | 'chat' | 'vault' | 'meetings'

interface Props {
  activeView: View
  ollamaRunning: boolean
  recentChats: Array<{ id: string; title: string }>
  activeChatId: string | null
  onNavigate: (view: View) => void
  onNewChat: () => void
  onSelectChat: (id: string) => void
}

export function Sidebar({
  activeView,
  ollamaRunning,
  recentChats,
  activeChatId,
  onNavigate,
  onNewChat,
  onSelectChat
}: Props) {
  return (
    <div className="w-[220px] flex-shrink-0 bg-[#f7f7f5] border-r border-[#e8e8e6] flex flex-col h-full select-none">
      {/* Traffic lights spacer for macOS titlebar */}
      <div className="h-9" />

      {/* Logo */}
      <div className="px-4 pb-3">
        <span className="text-[13px] font-semibold text-[#1a1a1a] tracking-tight">Arc</span>
      </div>

      {/* New Chat */}
      <div className="px-3 mb-2">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-[#444] hover:bg-[#ebebea] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          New chat
        </button>
      </div>

      {/* Nav items */}
      <nav className="px-3 space-y-0.5">
        <NavItem
          label="Home"
          active={activeView === 'home'}
          onClick={() => onNavigate('home')}
          icon={
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 6.5L7 1.5L13 6.5V13H9.5V9.5H4.5V13H1V6.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            </svg>
          }
        />
        <NavItem
          label="Vault"
          active={activeView === 'vault'}
          onClick={() => onNavigate('vault')}
          icon={
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M1 5h12" stroke="currentColor" strokeWidth="1.3"/>
              <circle cx="7" cy="8.5" r="1" fill="currentColor"/>
            </svg>
          }
        />
        <NavItem
          label="Meetings"
          active={activeView === 'meetings'}
          onClick={() => onNavigate('meetings')}
          icon={
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M7 4v3l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          }
        />
      </nav>

      {/* Recent conversations */}
      {recentChats.length > 0 && (
        <div className="mt-5 flex-1 overflow-y-auto min-h-0">
          <p className="px-4 text-[10px] font-semibold text-[#aaa] uppercase tracking-widest mb-1">
            Recents
          </p>
          <div className="px-3 space-y-0.5">
            {recentChats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-[13px] truncate transition-colors ${
                  activeChatId === chat.id
                    ? 'bg-white text-[#1a1a1a] shadow-sm'
                    : 'text-[#555] hover:bg-[#ebebea]'
                }`}
              >
                {chat.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1" />

      {/* Status + privacy at bottom */}
      <div className="px-4 py-4 border-t border-[#e8e8e6]">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ollamaRunning ? 'bg-emerald-500' : 'bg-amber-400'}`} />
          <span className="text-[11px] text-[#999]">
            {ollamaRunning ? 'AI ready · on-device' : 'Starting AI...'}
          </span>
        </div>
      </div>
    </div>
  )
}

function NavItem({
  label,
  active,
  icon,
  onClick
}: {
  label: string
  active: boolean
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
        active
          ? 'bg-white text-[#1a1a1a] shadow-sm font-medium'
          : 'text-[#555] hover:bg-[#ebebea]'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
