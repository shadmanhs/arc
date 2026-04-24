import React, { useState, useEffect, useCallback } from 'react'
import { Sidebar } from './components/Sidebar'
import { HomePage } from './pages/HomePage'
import { ChatPage } from './pages/ChatPage'
import { VaultPage } from './pages/VaultPage'
import { MeetingsPage } from './pages/MeetingsPage'
import { SettingsPage } from './pages/SettingsPage'
import { useChat } from './hooks/useChat'

type View = 'home' | 'chat' | 'vault' | 'meetings' | 'settings'

interface RecentChat {
  id: string
  title: string
}

export function App() {
  const [view, setView] = useState<View>('home')
  const [ollamaRunning, setOllamaRunning] = useState(false)
  const [recentChats, setRecentChats] = useState<RecentChat[]>([])

  const { messages, isStreaming, sendMessage, newConversation, conversationId } = useChat()

  // Poll Ollama status
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

  // Load recent conversations
  useEffect(() => {
    window.arc.conversations.list().then((convs) => {
      setRecentChats(convs.slice(0, 12).map((c) => ({ id: c.id, title: c.title })))
    }).catch(() => {})
  }, [conversationId])

  const handleSendFromHome = useCallback(
    async (text: string) => {
      setView('chat')
      await sendMessage(text)
    },
    [sendMessage]
  )

  const handleNewChat = useCallback(() => {
    newConversation()
    setView('home')
  }, [newConversation])

  const handleSelectChat = useCallback((_id: string) => {
    // Phase 2: load conversation by id
    setView('chat')
  }, [])

  const handleNavigate = useCallback((v: View) => {
    setView(v)
  }, [])

  const handleOpenSettings = useCallback(() => {
    setView('settings')
  }, [])

  return (
    <div
      className="flex h-screen bg-white font-sans"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {/* macOS drag region at very top */}
      <div
        className="fixed top-0 left-0 right-0 h-9 z-50"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      <Sidebar
        activeView={view}
        ollamaRunning={ollamaRunning}
        recentChats={recentChats}
        activeChatId={conversationId}
        onNavigate={handleNavigate}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onOpenSettings={handleOpenSettings}
      />

      <main className="flex-1 flex flex-col min-w-0 bg-white">
        {view === 'home' && (
          <HomePage onSend={handleSendFromHome} disabled={isStreaming} />
        )}
        {view === 'chat' && (
          <ChatPage
            messages={messages}
            isStreaming={isStreaming}
            onSend={sendMessage}
          />
        )}
        {view === 'vault' && <VaultPage />}
        {view === 'meetings' && <MeetingsPage />}
        {view === 'settings' && <SettingsPage onClose={() => setView('home')} />}
      </main>
    </div>
  )
}
