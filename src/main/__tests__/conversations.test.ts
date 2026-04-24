import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock data for readFileSync
const mockConversation = {
  id: 'abc',
  title: 'Test',
  messages: [],
  createdAt: '2026-04-24T00:00:00Z',
  updatedAt: '2026-04-24T00:00:00Z'
}

const mockExistsSync = vi.fn(() => false)
const mockMkdirSync = vi.fn()
const mockWriteFileSync = vi.fn()
const mockReadFileSync = vi.fn(() => JSON.stringify(mockConversation))
const mockReaddirSync = vi.fn(() => ['abc.json'])

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    writeFileSync: mockWriteFileSync,
    readFileSync: mockReadFileSync,
    readdirSync: mockReaddirSync
  },
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  readdirSync: mockReaddirSync
}))

vi.mock('electron', () => ({
  default: { app: { getPath: () => '/fake/userData' } },
  app: { getPath: () => '/fake/userData' }
}))

describe('ConversationStore', () => {
  let ConversationStore: typeof import('../conversations').ConversationStore

  beforeEach(async () => {
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(false)
    mockReaddirSync.mockReturnValue(['abc.json'] as unknown as ReturnType<typeof import('fs').readdirSync>)
    mockReadFileSync.mockReturnValue(JSON.stringify(mockConversation))
    const mod = await import('../conversations')
    ConversationStore = mod.ConversationStore
  })

  it('creates a new conversation with generated id', () => {
    const store = new ConversationStore()
    const conv = store.create('Contract Review')
    expect(conv.id).toBeTruthy()
    expect(conv.title).toBe('Contract Review')
    expect(conv.messages).toEqual([])
  })

  it('appends a message to a conversation', () => {
    const store = new ConversationStore()
    const conv = store.create('Test')
    store.appendMessage(conv.id, { role: 'user', content: 'hello', timestamp: '2026-04-24T00:00:00Z' })
    const updated = store.get(conv.id)
    expect(updated?.messages).toHaveLength(1)
    expect(updated?.messages[0].content).toBe('hello')
  })
})
