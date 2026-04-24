import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useChat } from '../useChat'

const mockArc = {
  conversations: {
    create: vi.fn().mockResolvedValue({ id: 'conv-1', title: 'New Chat', messages: [], createdAt: '', updatedAt: '' }),
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn()
  },
  chat: {
    send: vi.fn().mockResolvedValue(undefined),
    onChunk: vi.fn().mockReturnValue(() => {}),
    onDone: vi.fn().mockReturnValue(() => {})
  },
  ollama: { status: vi.fn().mockResolvedValue({ running: true }) }
}

// Attach arc API to the existing window object (don't replace window — that breaks jsdom)
Object.defineProperty(window, 'arc', { value: mockArc, writable: true, configurable: true })

describe('useChat', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts with empty messages and no active conversation', () => {
    const { result } = renderHook(() => useChat())
    expect(result.current.messages).toEqual([])
    expect(result.current.conversationId).toBeNull()
  })

  it('sendMessage creates conversation if none exists and calls chat.send', async () => {
    const { result } = renderHook(() => useChat())
    await act(async () => {
      await result.current.sendMessage('hello')
    })
    expect(mockArc.conversations.create).toHaveBeenCalledWith('New Chat')
    expect(mockArc.chat.send).toHaveBeenCalledWith('conv-1', 'hello')
  })
})
