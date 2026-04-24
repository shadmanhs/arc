import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// These mocks MUST be declared before any imports that use these modules.
// vi.mock is hoisted to the top of the file automatically.

const mockSpawnReturn = {
  pid: 12345,
  stdout: { on: vi.fn() },
  stderr: { on: vi.fn() },
  on: vi.fn()
}

const mockSpawn = vi.fn(() => mockSpawnReturn)
const mockExistsSync = vi.fn(() => true)
const mockChmodSync = vi.fn()

vi.mock('child_process', () => ({
  default: { spawn: mockSpawn },
  spawn: mockSpawn
}))

vi.mock('fs', () => ({
  default: { existsSync: mockExistsSync, chmodSync: mockChmodSync },
  existsSync: mockExistsSync,
  chmodSync: mockChmodSync
}))

// Mock fetch so waitForReady resolves immediately
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

describe('OllamaManager', () => {
  // Import after mocks are set up
  let OllamaManager: typeof import('../ollama').OllamaManager

  beforeEach(async () => {
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(true)
    // Re-import to get fresh module with mocks applied
    const mod = await import('../ollama')
    OllamaManager = mod.OllamaManager
  })

  it('starts ollama process and sets running state', async () => {
    const manager = new OllamaManager('/fake/path/to/ollama')
    await manager.start()
    expect(mockSpawn).toHaveBeenCalledWith(
      '/fake/path/to/ollama',
      ['serve'],
      expect.objectContaining({ env: expect.any(Object) })
    )
    expect(manager.isRunning()).toBe(true)
  })

  it('does not spawn twice if already running', async () => {
    const manager = new OllamaManager('/fake/path/to/ollama')
    await manager.start()
    await manager.start()
    expect(mockSpawn).toHaveBeenCalledTimes(1)
  })
})
