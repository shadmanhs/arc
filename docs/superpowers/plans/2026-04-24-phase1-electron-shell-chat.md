# Phase 1: Electron Shell + Ollama + Chat UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working Mac Electron app that boots Ollama, streams chat responses from a local LLM, and persists conversation history to disk — all without any cloud calls.

**Architecture:** Electron main process spawns and manages Ollama as a child process, exposes a safe IPC bridge to the React renderer, which renders a streaming chat UI. Conversations are saved as JSON to `~/Library/Application Support/Arc/conversations/`.

**Tech Stack:** Electron 32, React 18, Tailwind CSS 3, TypeScript, Ollama (bundled binary), electron-builder (packaging)

---

## File Structure

```
arc/
├── package.json
├── tsconfig.json
├── electron.vite.config.ts
├── src/
│   ├── main/
│   │   ├── index.ts              # Electron main entry — creates window, registers IPC
│   │   ├── ollama.ts             # Spawn/stop/health-check Ollama process
│   │   ├── conversations.ts      # Read/write conversation JSON files
│   │   └── ipc-handlers.ts       # All ipcMain.handle() registrations
│   ├── preload/
│   │   └── index.ts              # contextBridge — exposes safe API to renderer
│   └── renderer/
│       ├── index.html
│       ├── main.tsx              # React root
│       ├── App.tsx               # Router shell
│       ├── pages/
│       │   └── ChatPage.tsx      # Chat screen
│       ├── components/
│       │   ├── ChatInput.tsx     # Message input + send button
│       │   ├── MessageList.tsx   # Scrolling message history
│       │   ├── MessageBubble.tsx # Single message (user or AI)
│       │   └── StatusBar.tsx     # Model status + privacy badge
│       ├── hooks/
│       │   └── useChat.ts        # Chat state + streaming logic
│       └── styles/
│           └── globals.css       # Tailwind base
├── resources/
│   └── ollama               # Ollama binary (bundled, chmod +x)
└── electron-builder.yml     # Mac packaging config
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `electron.vite.config.ts`
- Create: `electron-builder.yml`

- [ ] **Step 1: Initialize the project**

```bash
mkdir -p ~/Desktop/arc && cd ~/Desktop/arc
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install electron@32 react@18 react-dom@18 tailwindcss@3 autoprefixer postcss
npm install --save-dev @types/react @types/react-dom @types/node typescript electron-vite electron-builder vite @vitejs/plugin-react @electron-toolkit/tsconfig
npm install --save-dev vitest @testing-library/react @testing-library/user-event jsdom
```

- [ ] **Step 3: Write package.json**

```json
{
  "name": "arc",
  "version": "0.1.0",
  "description": "Private AI for regulated industries",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "package": "npm run build && electron-builder",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "autoprefixer": "^10.0.0",
    "electron": "^32.0.0",
    "electron-builder": "^24.0.0",
    "electron-vite": "^2.0.0",
    "postcss": "^8.0.0",
    "tailwindcss": "^3.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0",
    "vitest": "^1.0.0"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

- [ ] **Step 4: Write tsconfig.json**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

Create `tsconfig.node.json`:
```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.node.json",
  "include": ["electron.vite.config.*", "src/main/**/*", "src/preload/**/*"]
}
```

Create `tsconfig.web.json`:
```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.web.json",
  "include": ["src/renderer/**/*"]
}
```

> Note: Install `@electron-toolkit/tsconfig`: `npm install --save-dev @electron-toolkit/tsconfig`

- [ ] **Step 5: Write electron.vite.config.ts**

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()],
    css: {
      postcss: {
        plugins: [require('tailwindcss'), require('autoprefixer')]
      }
    }
  }
})
```

- [ ] **Step 6: Write electron-builder.yml**

```yaml
appId: com.arc.app
productName: Arc
mac:
  category: public.app-category.productivity
  target:
    - target: dmg
      arch: [arm64, x64]
extraResources:
  - from: resources/ollama
    to: ollama
    filter: ["**/*"]
```

- [ ] **Step 7: Write vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: []
  }
})
```

- [ ] **Step 7b: Initialize Tailwind**

```bash
npx tailwindcss init -p
```

Update `tailwind.config.js`:
```javascript
module.exports = {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  theme: { extend: {} },
  plugins: []
}
```

- [ ] **Step 8: Add test script to package.json**

Ensure `package.json` scripts section has:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 9: Commit**

```bash
git init
echo "node_modules/\nout/\ndist/\n.env" > .gitignore
git add .
git commit -m "feat: scaffold Electron + React + Tailwind project"
```

Expected: clean git status after commit

---

### Task 2: Ollama Process Manager

**Files:**
- Create: `src/main/ollama.ts`
- Test: `src/main/__tests__/ollama.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/ollama.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OllamaManager } from '../ollama'

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    pid: 12345,
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn()
  }))
}))

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  chmodSync: vi.fn()
}))

describe('OllamaManager', () => {
  let manager: OllamaManager

  beforeEach(() => {
    manager = new OllamaManager('/fake/path/to/ollama')
  })

  it('starts ollama process and sets running state', async () => {
    const { spawn } = await import('child_process')
    await manager.start()
    expect(spawn).toHaveBeenCalledWith(
      '/fake/path/to/ollama',
      ['serve'],
      expect.objectContaining({ env: expect.any(Object) })
    )
    expect(manager.isRunning()).toBe(true)
  })

  it('does not spawn twice if already running', async () => {
    const { spawn } = await import('child_process')
    vi.mocked(spawn).mockClear()
    await manager.start()
    await manager.start()
    expect(spawn).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/main/__tests__/ollama.test.ts
```

Expected: FAIL — `OllamaManager` not found

- [ ] **Step 3: Implement src/main/ollama.ts**

```typescript
import { spawn, ChildProcess } from 'child_process'
import { existsSync, chmodSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export class OllamaManager {
  private process: ChildProcess | null = null
  private binaryPath: string
  private readonly port = 11434

  constructor(binaryPath?: string) {
    this.binaryPath = binaryPath ?? this.resolveBinaryPath()
  }

  private resolveBinaryPath(): string {
    // In packaged app, binary is in resources/ollama
    if (app.isPackaged) {
      return join(process.resourcesPath, 'ollama', 'ollama')
    }
    // In dev, use system ollama or bundled
    return join(app.getAppPath(), 'resources', 'ollama', 'ollama')
  }

  async start(): Promise<void> {
    if (this.process) return

    if (!existsSync(this.binaryPath)) {
      throw new Error(`Ollama binary not found at: ${this.binaryPath}`)
    }

    chmodSync(this.binaryPath, '755')

    this.process = spawn(this.binaryPath, ['serve'], {
      env: {
        ...process.env,
        OLLAMA_HOST: `127.0.0.1:${this.port}`,
        OLLAMA_MODELS: this.getModelsDir()
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    this.process.stdout?.on('data', (d) => console.log('[ollama]', d.toString()))
    this.process.stderr?.on('data', (d) => console.error('[ollama]', d.toString()))
    this.process.on('exit', (code) => {
      console.log('[ollama] exited with code', code)
      this.process = null
    })

    await this.waitForReady()
  }

  private getModelsDir(): string {
    return join(app.getPath('userData'), 'models')
  }

  private async waitForReady(retries = 20, delayMs = 500): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/api/tags`)
        if (res.ok) return
      } catch {
        // not ready yet
      }
      await new Promise((r) => setTimeout(r, delayMs))
    }
    throw new Error('Ollama did not become ready in time')
  }

  stop(): void {
    this.process?.kill()
    this.process = null
  }

  isRunning(): boolean {
    return this.process !== null
  }

  getBaseUrl(): string {
    return `http://127.0.0.1:${this.port}`
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/main/__tests__/ollama.test.ts
```

Expected: PASS — 2 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/main/ollama.ts src/main/__tests__/ollama.test.ts
git commit -m "feat: add OllamaManager — spawn/stop/health-check local Ollama process"
```

---

### Task 3: Conversation Persistence

**Files:**
- Create: `src/main/conversations.ts`
- Test: `src/main/__tests__/conversations.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/__tests__/conversations.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConversationStore } from '../conversations'

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => JSON.stringify({
    id: 'abc',
    title: 'Test',
    messages: [],
    createdAt: '2026-04-24T00:00:00Z',
    updatedAt: '2026-04-24T00:00:00Z'
  })),
  readdirSync: vi.fn(() => ['abc.json'])
}))

vi.mock('electron', () => ({ app: { getPath: () => '/fake/userData' } }))

describe('ConversationStore', () => {
  let store: ConversationStore

  beforeEach(() => {
    store = new ConversationStore()
  })

  it('creates a new conversation with generated id', () => {
    const conv = store.create('Contract Review')
    expect(conv.id).toBeTruthy()
    expect(conv.title).toBe('Contract Review')
    expect(conv.messages).toEqual([])
  })

  it('appends a message to a conversation', () => {
    const conv = store.create('Test')
    store.appendMessage(conv.id, { role: 'user', content: 'hello', timestamp: '2026-04-24T00:00:00Z' })
    const updated = store.get(conv.id)
    expect(updated?.messages).toHaveLength(1)
    expect(updated?.messages[0].content).toBe('hello')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/main/__tests__/conversations.test.ts
```

Expected: FAIL — `ConversationStore` not found

- [ ] **Step 3: Implement src/main/conversations.ts**

```typescript
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'

export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: string
  updatedAt: string
}

export class ConversationStore {
  private dir: string
  private cache: Map<string, Conversation> = new Map()

  constructor() {
    this.dir = join(app.getPath('userData'), 'conversations')
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true })
    }
  }

  create(title: string): Conversation {
    const now = new Date().toISOString()
    const conv: Conversation = {
      id: randomUUID(),
      title,
      messages: [],
      createdAt: now,
      updatedAt: now
    }
    this.cache.set(conv.id, conv)
    this.persist(conv)
    return conv
  }

  get(id: string): Conversation | undefined {
    if (this.cache.has(id)) return this.cache.get(id)
    const filePath = join(this.dir, `${id}.json`)
    if (!existsSync(filePath)) return undefined
    const conv = JSON.parse(readFileSync(filePath, 'utf-8')) as Conversation
    this.cache.set(id, conv)
    return conv
  }

  appendMessage(id: string, message: Message): void {
    const conv = this.get(id)
    if (!conv) throw new Error(`Conversation ${id} not found`)
    conv.messages.push(message)
    conv.updatedAt = new Date().toISOString()
    this.cache.set(id, conv)
    this.persist(conv)
  }

  list(): Conversation[] {
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const id = f.replace('.json', '')
        return this.get(id)!
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  private persist(conv: Conversation): void {
    writeFileSync(join(this.dir, `${conv.id}.json`), JSON.stringify(conv, null, 2))
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/main/__tests__/conversations.test.ts
```

Expected: PASS — 2 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/main/conversations.ts src/main/__tests__/conversations.test.ts
git commit -m "feat: add ConversationStore — persist chat history as JSON"
```

---

### Task 4: IPC Bridge (Main + Preload)

**Files:**
- Create: `src/main/ipc-handlers.ts`
- Create: `src/preload/index.ts`

- [ ] **Step 1: Write src/main/ipc-handlers.ts**

```typescript
import { ipcMain } from 'electron'
import { OllamaManager } from './ollama'
import { ConversationStore, Message } from './conversations'

export function registerIpcHandlers(
  ollama: OllamaManager,
  conversations: ConversationStore
): void {
  // Create a new conversation
  ipcMain.handle('conversations:create', (_event, title: string) => {
    return conversations.create(title)
  })

  // List all conversations
  ipcMain.handle('conversations:list', () => {
    return conversations.list()
  })

  // Get a single conversation
  ipcMain.handle('conversations:get', (_event, id: string) => {
    return conversations.get(id)
  })

  // Stream a chat message — sends chunks back via webContents.send
  ipcMain.handle(
    'chat:send',
    async (event, { conversationId, message }: { conversationId: string; message: string }) => {
      const userMsg: Message = {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      }
      conversations.appendMessage(conversationId, userMsg)

      const conv = conversations.get(conversationId)!
      const messages = conv.messages.map((m) => ({ role: m.role, content: m.content }))

      const res = await fetch(`${ollama.getBaseUrl()}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen2.5:7b',
          messages,
          stream: true
        })
      })

      if (!res.ok || !res.body) {
        throw new Error(`Ollama request failed: ${res.status}`)
      }

      let fullResponse = ''
      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = decoder.decode(value).split('\n').filter(Boolean)
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line)
            const chunk = parsed.message?.content ?? ''
            fullResponse += chunk
            event.sender.send('chat:chunk', { conversationId, chunk })
          } catch {
            // malformed chunk — skip
          }
        }
      }

      const assistantMsg: Message = {
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date().toISOString()
      }
      conversations.appendMessage(conversationId, assistantMsg)
      event.sender.send('chat:done', { conversationId })
    }
  )

  // Get Ollama status
  ipcMain.handle('ollama:status', () => ({
    running: ollama.isRunning()
  }))
}
```

- [ ] **Step 2: Write src/preload/index.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('arc', {
  conversations: {
    create: (title: string) => ipcRenderer.invoke('conversations:create', title),
    list: () => ipcRenderer.invoke('conversations:list'),
    get: (id: string) => ipcRenderer.invoke('conversations:get', id)
  },
  chat: {
    send: (conversationId: string, message: string) =>
      ipcRenderer.invoke('chat:send', { conversationId, message }),
    onChunk: (cb: (data: { conversationId: string; chunk: string }) => void) => {
      ipcRenderer.on('chat:chunk', (_event, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('chat:chunk')
    },
    onDone: (cb: (data: { conversationId: string }) => void) => {
      ipcRenderer.on('chat:done', (_event, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('chat:done')
    }
  },
  ollama: {
    status: () => ipcRenderer.invoke('ollama:status')
  }
})
```

- [ ] **Step 3: Add global type declaration**

Create `src/renderer/env.d.ts`:
```typescript
interface ArcAPI {
  conversations: {
    create: (title: string) => Promise<import('../main/conversations').Conversation>
    list: () => Promise<import('../main/conversations').Conversation[]>
    get: (id: string) => Promise<import('../main/conversations').Conversation | undefined>
  }
  chat: {
    send: (conversationId: string, message: string) => Promise<void>
    onChunk: (cb: (data: { conversationId: string; chunk: string }) => void) => () => void
    onDone: (cb: (data: { conversationId: string }) => void) => () => void
  }
  ollama: {
    status: () => Promise<{ running: boolean }>
  }
}

declare global {
  interface Window {
    arc: ArcAPI
  }
}

export {}
```

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc-handlers.ts src/preload/index.ts src/renderer/env.d.ts
git commit -m "feat: wire IPC bridge — chat streaming + conversation CRUD"
```

---

### Task 5: Electron Main Entry

**Files:**
- Create: `src/main/index.ts`

- [ ] **Step 1: Write src/main/index.ts**

```typescript
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { OllamaManager } from './ollama'
import { ConversationStore } from './conversations'
import { registerIpcHandlers } from './ipc-handlers'

const ollama = new OllamaManager()
const conversations = new ConversationStore()

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Open external links in browser, not Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  return win
}

app.whenReady().then(async () => {
  registerIpcHandlers(ollama, conversations)

  try {
    await ollama.start()
    console.log('Ollama started')
  } catch (err) {
    console.error('Failed to start Ollama:', err)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  ollama.stop()
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 2: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: Electron main entry — boots Ollama, creates window, registers IPC"
```

---

### Task 6: useChat Hook

**Files:**
- Create: `src/renderer/hooks/useChat.ts`
- Test: `src/renderer/hooks/__tests__/useChat.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/hooks/__tests__/useChat.test.ts
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

vi.stubGlobal('window', { arc: mockArc })

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
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/renderer/hooks/__tests__/useChat.test.ts
```

Expected: FAIL — `useChat` not found

- [ ] **Step 3: Implement src/renderer/hooks/useChat.ts**

```typescript
import { useState, useEffect, useCallback, useRef } from 'react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const cleanupRef = useRef<(() => void)[]>([])

  useEffect(() => {
    const removeChunk = window.arc.chat.onChunk(({ chunk }) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.streaming) {
          return [...prev.slice(0, -1), { ...last, content: last.content + chunk }]
        }
        return prev
      })
    })

    const removeDone = window.arc.chat.onDone(() => {
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.streaming) {
          return [...prev.slice(0, -1), { ...last, streaming: false }]
        }
        return prev
      })
      setIsStreaming(false)
    })

    cleanupRef.current = [removeChunk, removeDone]
    return () => cleanupRef.current.forEach((fn) => fn())
  }, [])

  const sendMessage = useCallback(
    async (text: string) => {
      if (isStreaming) return

      let convId = conversationId
      if (!convId) {
        const conv = await window.arc.conversations.create('New Chat')
        convId = conv.id
        setConversationId(convId)
      }

      const userMsg: ChatMessage = {
        id: `${Date.now()}-user`,
        role: 'user',
        content: text
      }
      const assistantPlaceholder: ChatMessage = {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        content: '',
        streaming: true
      }

      setMessages((prev) => [...prev, userMsg, assistantPlaceholder])
      setIsStreaming(true)

      await window.arc.chat.send(convId, text)
    },
    [conversationId, isStreaming]
  )

  const newConversation = useCallback(() => {
    setMessages([])
    setConversationId(null)
    setIsStreaming(false)
  }, [])

  return { messages, conversationId, isStreaming, sendMessage, newConversation }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/renderer/hooks/__tests__/useChat.test.ts
```

Expected: PASS — 2 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hooks/useChat.ts src/renderer/hooks/__tests__/useChat.test.ts
git commit -m "feat: useChat hook — streaming chat state management"
```

---

### Task 7: Chat UI Components

**Files:**
- Create: `src/renderer/components/MessageBubble.tsx`
- Create: `src/renderer/components/MessageList.tsx`
- Create: `src/renderer/components/ChatInput.tsx`
- Create: `src/renderer/components/StatusBar.tsx`
- Create: `src/renderer/pages/ChatPage.tsx`

- [ ] **Step 1: Write src/renderer/components/MessageBubble.tsx**

```typescript
import React from 'react'
import { ChatMessage } from '../hooks/useChat'

interface Props {
  message: ChatMessage
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
          isUser
            ? 'bg-[#1a1a1a] text-white'
            : 'bg-[#f4f4f4] text-[#1a1a1a]'
        }`}
      >
        {message.content}
        {message.streaming && (
          <span className="inline-block w-1.5 h-4 bg-current ml-0.5 animate-pulse align-middle" />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write src/renderer/components/MessageList.tsx**

```typescript
import React, { useEffect, useRef } from 'react'
import { ChatMessage } from '../hooks/useChat'
import { MessageBubble } from './MessageBubble'

interface Props {
  messages: ChatMessage[]
}

export function MessageList({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      {messages.length === 0 && (
        <div className="flex items-center justify-center h-full text-[#999] text-[15px]">
          Ask anything — your conversation stays on this Mac
        </div>
      )}
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
```

- [ ] **Step 3: Write src/renderer/components/ChatInput.tsx**

```typescript
import React, { useState, KeyboardEvent } from 'react'

interface Props {
  onSend: (text: string) => void
  disabled?: boolean
}

export function ChatInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState('')

  const handleSend = () => {
    const text = value.trim()
    if (!text || disabled) return
    onSend(text)
    setValue('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-[#e5e5e5] px-6 py-4">
      <div className="flex items-end gap-3 bg-[#f9f9f9] rounded-2xl border border-[#e0e0e0] px-4 py-3">
        <textarea
          className="flex-1 bg-transparent resize-none outline-none text-[15px] text-[#1a1a1a] placeholder:text-[#aaa] max-h-40 min-h-[24px]"
          placeholder="Ask anything..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
        />
        <button
          onClick={handleSend}
          disabled={!value.trim() || disabled}
          className="w-8 h-8 rounded-full bg-[#1a1a1a] text-white flex items-center justify-center disabled:opacity-30 flex-shrink-0 transition-opacity"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1L7 13M7 1L2 6M7 1L12 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Write src/renderer/components/StatusBar.tsx**

```typescript
import React, { useEffect, useState } from 'react'

export function StatusBar() {
  const [ollamaRunning, setOllamaRunning] = useState(false)

  useEffect(() => {
    const check = async () => {
      const status = await window.arc.ollama.status()
      setOllamaRunning(status.running)
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
```

- [ ] **Step 5: Write src/renderer/pages/ChatPage.tsx**

```typescript
import React from 'react'
import { useChat } from '../hooks/useChat'
import { MessageList } from '../components/MessageList'
import { ChatInput } from '../components/ChatInput'

export function ChatPage() {
  const { messages, isStreaming, sendMessage } = useChat()

  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages} />
      <ChatInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  )
}
```

- [ ] **Step 6: Write src/renderer/App.tsx**

```typescript
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
```

- [ ] **Step 7: Write src/renderer/main.tsx and index.html**

`src/renderer/main.tsx`:
```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

`src/renderer/styles/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; }
```

`src/renderer/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Arc</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Commit**

```bash
git add src/renderer/
git commit -m "feat: chat UI — MessageList, ChatInput, StatusBar, ChatPage"
```

---

### Task 8: Smoke Test & Dev Run

**Files:** none (verification only)

- [ ] **Step 1: Download Ollama binary for dev**

```bash
# Download the Ollama CLI
curl -L https://ollama.com/download/ollama-darwin -o resources/ollama/ollama
chmod +x resources/ollama/ollama

# Pull the default model (will download ~4GB)
./resources/ollama/ollama pull qwen2.5:7b
```

- [ ] **Step 2: Run the app in dev mode**

```bash
npm run dev
```

Expected: Electron window opens, status bar shows "Your AI is ready" (green dot) after Ollama starts, chat input is visible

- [ ] **Step 3: Send a test message**

Type "Hello, can you hear me?" and press Enter.

Expected: Message appears in chat, AI response streams in token by token

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add resources/
git commit -m "chore: add Ollama binary to resources for dev"
```

---

## Progress Checkpoint

After Phase 1 is complete, you have:
- ✅ Working Electron app that boots and manages Ollama
- ✅ Streaming chat with local LLM (Qwen2.5 7B)
- ✅ Conversations saved to disk
- ✅ Clean React UI matching design system
- ✅ All tests passing

**Next:** Phase 2 — Document Intelligence (RAG sidecar + vault + drag-drop)

See: `docs/superpowers/plans/2026-04-24-phase2-document-intelligence.md` (to be written before Phase 2 begins)
