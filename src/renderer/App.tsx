import React from 'react'
import { StatusBar } from './components/StatusBar'
import { ChatPage } from './pages/ChatPage'

export function App() {
  return (
    <div className="flex flex-col h-screen bg-white font-sans">
      <StatusBar />
      <ChatPage />
    </div>
  )
}
