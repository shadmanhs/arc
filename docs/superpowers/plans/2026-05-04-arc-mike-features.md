# Arc — Mike Feature Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Mike's document vault, workflows, tabular reviews, tracked-changes editing, and meeting transcription inside Arc's existing Electron/React stack, backed by SQLite and a unified ModelGateway that supports Ollama (local SLM), Claude API, and Gemini API.

**Architecture:** IPC-native (Option A) — thin `ipcMain.handle` handlers per domain call into pure service classes that hold all business logic. `better-sqlite3` replaces the JSON conversation store. `ModelGateway` is the single entry point for all LLM calls, routing to Ollama/Claude/Gemini based on user preference.

**Tech Stack:** Electron 32, React 18, Tailwind CSS, better-sqlite3, pdf-parse, mammoth, @anthropic-ai/sdk, @google/generative-ai, uuid

---

## Phase 1 — Foundation (SQLite + ModelGateway + IPC reorganization)

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

```bash
cd /Users/admin/Desktop/arc
npm install better-sqlite3 uuid mammoth pdf-parse @anthropic-ai/sdk @google/generative-ai
```

- [ ] **Step 2: Install dev deps**

```bash
npm install --save-dev @types/better-sqlite3 @types/uuid @types/mammoth @types/pdf-parse
```

- [ ] **Step 3: Verify no peer dep errors**

```bash
npm ls better-sqlite3 uuid mammoth pdf-parse
```
Expected: all listed with no UNMET PEER dependency warnings.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install sqlite, llm sdk, and document processing deps"
```

---

### Task 2: SQLite database module + migrations

**Files:**
- Create: `src/main/db/database.ts`
- Create: `src/main/db/migrations/001_init.sql`

- [ ] **Step 1: Write migration SQL**

Create `src/main/db/migrations/001_init.sql`:

```sql
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('model_provider', 'ollama'),
  ('ollama_model', 'qwen2.5:7b'),
  ('claude_api_key', ''),
  ('gemini_api_key', '');

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL,
  annotations TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages(chat_id);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  text_content TEXT,
  page_count INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','done','error')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_doc_versions_doc ON document_versions(document_id);

CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'assistant' CHECK(type IN ('assistant','tabular')),
  system_prompt TEXT NOT NULL DEFAULT '',
  columns_json TEXT NOT NULL DEFAULT '[]',
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tabular_reviews (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  columns_json TEXT NOT NULL DEFAULT '[]',
  document_ids_json TEXT NOT NULL DEFAULT '[]',
  workflow_id TEXT REFERENCES workflows(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tabular_cells (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES tabular_reviews(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  column_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','generating','done','error')),
  content_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(review_id, document_id, column_key)
);

CREATE INDEX IF NOT EXISTS idx_cells_review ON tabular_cells(review_id);

CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled Meeting',
  audio_path TEXT,
  transcript_path TEXT,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','recording','transcribing','summarizing','done','error')),
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Write database.ts**

Create `src/main/db/database.ts`:

```typescript
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { mkdirSync } from 'fs'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db

  const dataDir = app.getPath('userData')
  mkdirSync(dataDir, { recursive: true })
  const dbPath = join(dataDir, 'arc.db')

  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')

  const migration = readFileSync(
    join(__dirname, 'migrations', '001_init.sql'),
    'utf8'
  )
  _db.exec(migration)

  return _db
}

export function closeDb(): void {
  _db?.close()
  _db = null
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/admin/Desktop/arc
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/db/
git commit -m "feat: sqlite database module with full schema migration"
```

---

### Task 3: ModelGateway service

**Files:**
- Create: `src/main/services/ModelGateway.ts`

- [ ] **Step 1: Write ModelGateway**

Create `src/main/services/ModelGateway.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getDb } from '../db/database'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamChatParams {
  messages: ChatMessage[]
  systemPrompt?: string
  onChunk: (chunk: string) => void
  onDone: (fullText: string) => void
  onError: (err: Error) => void
}

function getSettings(): { provider: string; ollamaModel: string; claudeKey: string; geminiKey: string } {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as { key: string; value: string }[]
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return {
    provider: s['model_provider'] ?? 'ollama',
    ollamaModel: s['ollama_model'] ?? 'qwen2.5:7b',
    claudeKey: s['claude_api_key'] ?? '',
    geminiKey: s['gemini_api_key'] ?? '',
  }
}

async function streamOllama(params: StreamChatParams, model: string): Promise<void> {
  const body = {
    model,
    messages: params.messages,
    stream: true,
    ...(params.systemPrompt ? { system: params.systemPrompt } : {}),
  }

  const res = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok || !res.body) throw new Error(`Ollama error: ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const line of decoder.decode(value).split('\n').filter(Boolean)) {
      try {
        const parsed = JSON.parse(line)
        const chunk = parsed.message?.content ?? ''
        full += chunk
        if (chunk) params.onChunk(chunk)
      } catch { /* skip malformed */ }
    }
  }

  params.onDone(full)
}

async function streamClaude(params: StreamChatParams, apiKey: string): Promise<void> {
  const client = new Anthropic({ apiKey })
  let full = ''

  const stream = await client.messages.stream({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    system: params.systemPrompt,
    messages: params.messages,
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      full += event.delta.text
      params.onChunk(event.delta.text)
    }
  }

  params.onDone(full)
}

async function streamGemini(params: StreamChatParams, apiKey: string): Promise<void> {
  const genai = new GoogleGenerativeAI(apiKey)
  const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash' })

  const history = params.messages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const last = params.messages[params.messages.length - 1]
  const chat = model.startChat({
    history,
    systemInstruction: params.systemPrompt,
  })

  const result = await chat.sendMessageStream(last.content)
  let full = ''

  for await (const chunk of result.stream) {
    const text = chunk.text()
    full += text
    if (text) params.onChunk(text)
  }

  params.onDone(full)
}

export async function streamChat(params: StreamChatParams): Promise<void> {
  const settings = getSettings()

  try {
    if (settings.provider === 'claude' && settings.claudeKey) {
      await streamClaude(params, settings.claudeKey)
    } else if (settings.provider === 'gemini' && settings.geminiKey) {
      await streamGemini(params, settings.geminiKey)
    } else {
      await streamOllama(params, settings.ollamaModel)
    }
  } catch (err) {
    params.onError(err instanceof Error ? err : new Error(String(err)))
  }
}

export function updateSetting(key: string, value: string): void {
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value)
}

export function getSetting(key: string): string {
  const db = getDb()
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? ''
}
```

- [ ] **Step 2: Check types compile**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/services/ModelGateway.ts
git commit -m "feat: ModelGateway — Ollama/Claude/Gemini unified streaming interface"
```

---

### Task 4: ChatService + migrate IPC chat handler to use it

**Files:**
- Create: `src/main/services/ChatService.ts`
- Create: `src/main/ipc-handlers/chat.ts`
- Create: `src/main/ipc-handlers/settings.ts`
- Create: `src/main/ipc-handlers/index.ts`
- Modify: `src/main/index.ts`
- Delete logic from: `src/main/ipc-handlers.ts` (keep file, gut it)

- [ ] **Step 1: Write ChatService**

Create `src/main/services/ChatService.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'

export interface Chat {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  chat_id: string
  role: 'user' | 'assistant'
  content: string
  annotations: Annotation[]
  created_at: string
}

export interface Annotation {
  doc_id: string
  doc_name: string
  page?: number
  quote?: string
}

export function createChat(title = 'New Chat'): Chat {
  const db = getDb()
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare('INSERT INTO chats (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, title, now, now)
  return { id, title, created_at: now, updated_at: now }
}

export function listChats(): Chat[] {
  const db = getDb()
  return db.prepare('SELECT * FROM chats ORDER BY updated_at DESC').all() as Chat[]
}

export function getChat(id: string): Chat | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM chats WHERE id = ?').get(id) as Chat | undefined
}

export function getChatMessages(chatId: string): ChatMessage[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY created_at ASC').all(chatId) as Array<Omit<ChatMessage, 'annotations'> & { annotations: string }>
  return rows.map((r) => ({ ...r, annotations: JSON.parse(r.annotations) }))
}

export function addMessage(chatId: string, role: 'user' | 'assistant', content: string, annotations: Annotation[] = []): ChatMessage {
  const db = getDb()
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare('INSERT INTO chat_messages (id, chat_id, role, content, annotations, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, chatId, role, content, JSON.stringify(annotations), now)
  db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(now, chatId)
  return { id, chat_id: chatId, role, content, annotations, created_at: now }
}

export function updateChatTitle(id: string, title: string): void {
  const db = getDb()
  db.prepare('UPDATE chats SET title = ?, updated_at = ? WHERE id = ?').run(title, new Date().toISOString(), id)
}

export function deleteChat(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM chats WHERE id = ?').run(id)
}
```

- [ ] **Step 2: Write chat IPC handler**

Create `src/main/ipc-handlers/chat.ts`:

```typescript
import { ipcMain, IpcMainInvokeEvent } from 'electron'
import * as ChatService from '../services/ChatService'
import { streamChat } from '../services/ModelGateway'

export function registerChatHandlers(): void {
  ipcMain.handle('chat:create', () => ChatService.createChat())
  ipcMain.handle('chat:list', () => ChatService.listChats())
  ipcMain.handle('chat:get', (_e: IpcMainInvokeEvent, id: string) => ChatService.getChat(id))
  ipcMain.handle('chat:messages', (_e: IpcMainInvokeEvent, chatId: string) => ChatService.getChatMessages(chatId))
  ipcMain.handle('chat:delete', (_e: IpcMainInvokeEvent, id: string) => ChatService.deleteChat(id))
  ipcMain.handle('chat:updateTitle', (_e: IpcMainInvokeEvent, id: string, title: string) => ChatService.updateChatTitle(id, title))

  ipcMain.handle('chat:send', async (event: IpcMainInvokeEvent, { chatId, content, systemPrompt }: { chatId: string; content: string; systemPrompt?: string }) => {
    ChatService.addMessage(chatId, 'user', content)

    const history = ChatService.getChatMessages(chatId).map((m) => ({ role: m.role, content: m.content }))

    let fullText = ''

    await streamChat({
      messages: history,
      systemPrompt,
      onChunk: (chunk) => {
        fullText += chunk
        event.sender.send('chat:chunk', { chatId, chunk })
      },
      onDone: (text) => {
        ChatService.addMessage(chatId, 'assistant', text)
        event.sender.send('chat:done', { chatId })
      },
      onError: (err) => {
        event.sender.send('chat:error', { chatId, error: err.message })
      },
    })

    return { ok: true }
  })
}
```

- [ ] **Step 3: Write settings IPC handler**

Create `src/main/ipc-handlers/settings.ts`:

```typescript
import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { updateSetting, getSetting } from '../services/ModelGateway'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', (_e: IpcMainInvokeEvent, key: string) => getSetting(key))
  ipcMain.handle('settings:set', (_e: IpcMainInvokeEvent, key: string, value: string) => { updateSetting(key, value) })
  ipcMain.handle('settings:getAll', () => {
    const keys = ['model_provider', 'ollama_model', 'claude_api_key', 'gemini_api_key']
    return Object.fromEntries(keys.map((k) => [k, getSetting(k)]))
  })
}
```

- [ ] **Step 4: Write IPC index**

Create `src/main/ipc-handlers/index.ts`:

```typescript
import { registerChatHandlers } from './chat'
import { registerSettingsHandlers } from './settings'

export function registerAllHandlers(): void {
  registerChatHandlers()
  registerSettingsHandlers()
}
```

- [ ] **Step 5: Update main/index.ts**

Replace the `registerIpcHandlers(ollama, conversations)` call and imports in `src/main/index.ts`:

```typescript
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { OllamaManager } from './ollama'
import { registerAllHandlers } from './ipc-handlers/index'
import { getDb, closeDb } from './db/database'

const ollama = new OllamaManager()

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

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  return win
}

app.whenReady().then(async () => {
  getDb() // initialise + run migrations
  registerAllHandlers()

  try {
    await ollama.start()
  } catch (err) {
    console.error('Failed to start Ollama:', err)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDb()
  ollama.stop()
  if (process.platform !== 'darwin') app.quit()
})
```

Also add an `ollama:status` handler to `ipc-handlers/index.ts` — add to the IPC index and create `src/main/ipc-handlers/ollama.ts`:

```typescript
import { ipcMain } from 'electron'
import { OllamaManager } from '../ollama'

let _ollama: OllamaManager

export function registerOllamaHandlers(ollama: OllamaManager): void {
  _ollama = ollama
  ipcMain.handle('ollama:status', () => ({ running: ollama.isRunning() }))
}
```

Update `ipc-handlers/index.ts`:

```typescript
import { registerChatHandlers } from './chat'
import { registerSettingsHandlers } from './settings'
import { registerOllamaHandlers } from './ollama'
import { OllamaManager } from '../ollama'

export function registerAllHandlers(ollama: OllamaManager): void {
  registerChatHandlers()
  registerSettingsHandlers()
  registerOllamaHandlers(ollama)
}
```

Update `main/index.ts` call to `registerAllHandlers(ollama)`.

- [ ] **Step 6: Update preload to expose new chat + settings channels**

Replace `src/preload/index.ts` with:

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('arc', {
  ollama: {
    status: () => ipcRenderer.invoke('ollama:status'),
  },
  chat: {
    create: () => ipcRenderer.invoke('chat:create'),
    list: () => ipcRenderer.invoke('chat:list'),
    get: (id: string) => ipcRenderer.invoke('chat:get', id),
    messages: (chatId: string) => ipcRenderer.invoke('chat:messages', chatId),
    send: (args: { chatId: string; content: string; systemPrompt?: string }) => ipcRenderer.invoke('chat:send', args),
    delete: (id: string) => ipcRenderer.invoke('chat:delete', id),
    updateTitle: (id: string, title: string) => ipcRenderer.invoke('chat:updateTitle', id, title),
    onChunk: (cb: (data: { chatId: string; chunk: string }) => void) => {
      ipcRenderer.on('chat:chunk', (_e, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('chat:chunk')
    },
    onDone: (cb: (data: { chatId: string }) => void) => {
      ipcRenderer.on('chat:done', (_e, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('chat:done')
    },
    onError: (cb: (data: { chatId: string; error: string }) => void) => {
      ipcRenderer.on('chat:error', (_e, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('chat:error')
    },
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  },
  conversations: {
    // legacy shim — renderer still calls this; returns empty until migrated
    list: () => Promise.resolve([]),
  },
})
```

- [ ] **Step 7: Update env.d.ts types**

Replace `src/renderer/env.d.ts` with:

```typescript
interface Annotation {
  doc_id: string
  doc_name: string
  page?: number
  quote?: string
}

interface ChatRecord {
  id: string
  title: string
  created_at: string
  updated_at: string
}

interface ChatMessageRecord {
  id: string
  chat_id: string
  role: 'user' | 'assistant'
  content: string
  annotations: Annotation[]
  created_at: string
}

interface Window {
  arc: {
    ollama: {
      status: () => Promise<{ running: boolean }>
    }
    chat: {
      create: () => Promise<ChatRecord>
      list: () => Promise<ChatRecord[]>
      get: (id: string) => Promise<ChatRecord | undefined>
      messages: (chatId: string) => Promise<ChatMessageRecord[]>
      send: (args: { chatId: string; content: string; systemPrompt?: string }) => Promise<{ ok: boolean }>
      delete: (id: string) => Promise<void>
      updateTitle: (id: string, title: string) => Promise<void>
      onChunk: (cb: (data: { chatId: string; chunk: string }) => void) => () => void
      onDone: (cb: (data: { chatId: string }) => void) => () => void
      onError: (cb: (data: { chatId: string; error: string }) => void) => () => void
    }
    settings: {
      get: (key: string) => Promise<string>
      set: (key: string, value: string) => Promise<void>
      getAll: () => Promise<Record<string, string>>
    }
    conversations: {
      list: () => Promise<{ id: string; title: string }[]>
    }
  }
}
```

- [ ] **Step 8: Update useChat hook to use new API**

Replace `src/renderer/hooks/useChat.ts`:

```typescript
import { useState, useRef, useCallback, useEffect } from 'react'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export function useChat() {
  const [chatId, setChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const streamingContentRef = useRef('')

  useEffect(() => {
    const offChunk = window.arc.chat.onChunk(({ chatId: cid, chunk }) => {
      if (cid !== chatId) return
      streamingContentRef.current += chunk
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.id === 'streaming') {
          return [...prev.slice(0, -1), { ...last, content: streamingContentRef.current }]
        }
        return [...prev, { id: 'streaming', role: 'assistant', content: chunk }]
      })
    })

    const offDone = window.arc.chat.onDone(async ({ chatId: cid }) => {
      if (cid !== chatId) return
      setIsStreaming(false)
      streamingContentRef.current = ''
      // reload messages from DB to get persisted IDs
      const msgs = await window.arc.chat.messages(cid)
      setMessages(msgs.map((m) => ({ id: m.id, role: m.role, content: m.content })))
    })

    const offError = window.arc.chat.onError(({ chatId: cid, error }) => {
      if (cid !== chatId) return
      setIsStreaming(false)
      streamingContentRef.current = ''
      setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'assistant', content: `Error: ${error}` }])
    })

    return () => { offChunk(); offDone(); offError() }
  }, [chatId])

  const ensureChat = useCallback(async () => {
    if (chatId) return chatId
    const chat = await window.arc.chat.create()
    setChatId(chat.id)
    return chat.id
  }, [chatId])

  const sendMessage = useCallback(async (content: string, systemPrompt?: string) => {
    const id = await ensureChat()
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'user', content }])
    setIsStreaming(true)
    streamingContentRef.current = ''
    await window.arc.chat.send({ chatId: id, content, systemPrompt })
  }, [ensureChat])

  const newConversation = useCallback(() => {
    setChatId(null)
    setMessages([])
    setIsStreaming(false)
    streamingContentRef.current = ''
  }, [])

  const loadConversation = useCallback(async (id: string) => {
    setChatId(id)
    const msgs = await window.arc.chat.messages(id)
    setMessages(msgs.map((m) => ({ id: m.id, role: m.role, content: m.content })))
  }, [])

  return { chatId, messages, isStreaming, sendMessage, newConversation, loadConversation }
}
```

- [ ] **Step 9: Build and smoke test**

```bash
npm run dev
```
Expected: app launches, home screen shows, sending a message works with Ollama streaming.

- [ ] **Step 10: Commit**

```bash
git add src/
git commit -m "feat: SQLite-backed chat with ModelGateway, domain IPC handlers"
```

---

## Phase 2 — Document Vault

### Task 5: DocumentService

**Files:**
- Create: `src/main/services/DocumentService.ts`

- [ ] **Step 1: Write DocumentService**

Create `src/main/services/DocumentService.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, copyFileSync, existsSync } from 'fs'
import { readFile } from 'fs/promises'

export interface Document {
  id: string
  name: string
  mime_type: string
  file_path: string
  text_content: string | null
  page_count: number | null
  status: 'pending' | 'processing' | 'done' | 'error'
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface DocumentVersion {
  id: string
  document_id: string
  version_number: number
  file_path: string
  label: string | null
  created_at: string
}

function vaultDir(): string {
  const dir = join(app.getPath('userData'), 'vault')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function listDocuments(): Document[] {
  const db = getDb()
  return db.prepare('SELECT * FROM documents ORDER BY created_at DESC').all() as Document[]
}

export function getDocument(id: string): Document | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as Document | undefined
}

export function importDocument(sourcePath: string, name: string, mimeType: string): Document {
  const db = getDb()
  const id = uuidv4()
  const now = new Date().toISOString()
  const ext = name.split('.').pop() ?? 'bin'
  const destPath = join(vaultDir(), `${id}.${ext}`)

  copyFileSync(sourcePath, destPath)

  db.prepare(`
    INSERT INTO documents (id, name, mime_type, file_path, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?)
  `).run(id, name, mimeType, destPath, now, now)

  return getDocument(id)!
}

export async function processDocument(id: string): Promise<void> {
  const db = getDb()
  const doc = getDocument(id)
  if (!doc) throw new Error(`Document ${id} not found`)

  db.prepare(`UPDATE documents SET status = 'processing', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), id)

  try {
    let text = ''
    let pageCount: number | null = null

    if (doc.mime_type === 'application/pdf') {
      const pdfParse = await import('pdf-parse')
      const buf = await readFile(doc.file_path)
      const data = await pdfParse.default(buf)
      text = data.text
      pageCount = data.numpages
    } else if (
      doc.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      doc.name.endsWith('.docx')
    ) {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ path: doc.file_path })
      text = result.value
    } else {
      text = await readFile(doc.file_path, 'utf8')
    }

    db.prepare(`
      UPDATE documents SET status = 'done', text_content = ?, page_count = ?, updated_at = ? WHERE id = ?
    `).run(text, pageCount, new Date().toISOString(), id)

    // Create initial version
    createVersion(id, doc.file_path, 'Original')
  } catch (err) {
    db.prepare(`
      UPDATE documents SET status = 'error', error_message = ?, updated_at = ? WHERE id = ?
    `).run(String(err), new Date().toISOString(), id)
  }
}

export function createVersion(documentId: string, filePath: string, label?: string): DocumentVersion {
  const db = getDb()
  const id = uuidv4()
  const now = new Date().toISOString()
  const lastVersion = db.prepare(
    'SELECT MAX(version_number) as v FROM document_versions WHERE document_id = ?'
  ).get(documentId) as { v: number | null }
  const versionNumber = (lastVersion.v ?? 0) + 1

  const ext = filePath.split('.').pop() ?? 'bin'
  const versionPath = join(vaultDir(), `${documentId}_v${versionNumber}.${ext}`)
  if (!existsSync(versionPath)) copyFileSync(filePath, versionPath)

  db.prepare(`
    INSERT INTO document_versions (id, document_id, version_number, file_path, label, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, documentId, versionNumber, versionPath, label ?? `Version ${versionNumber}`, now)

  return db.prepare('SELECT * FROM document_versions WHERE id = ?').get(id) as DocumentVersion
}

export function listVersions(documentId: string): DocumentVersion[] {
  const db = getDb()
  return db.prepare('SELECT * FROM document_versions WHERE document_id = ? ORDER BY version_number ASC').all(documentId) as DocumentVersion[]
}

export function renameDocument(id: string, name: string): void {
  const db = getDb()
  db.prepare('UPDATE documents SET name = ?, updated_at = ? WHERE id = ?').run(name, new Date().toISOString(), id)
}

export function deleteDocument(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM documents WHERE id = ?').run(id)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/services/DocumentService.ts
git commit -m "feat: DocumentService — import, process, version documents locally"
```

---

### Task 6: Document IPC handlers + preload bridge

**Files:**
- Create: `src/main/ipc-handlers/documents.ts`
- Modify: `src/main/ipc-handlers/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/env.d.ts`

- [ ] **Step 1: Write document handlers**

Create `src/main/ipc-handlers/documents.ts`:

```typescript
import { ipcMain, IpcMainInvokeEvent, dialog } from 'electron'
import * as DocumentService from '../services/DocumentService'
import { lookup } from 'mime-types'

export function registerDocumentHandlers(): void {
  ipcMain.handle('documents:list', () => DocumentService.listDocuments())

  ipcMain.handle('documents:get', (_e: IpcMainInvokeEvent, id: string) =>
    DocumentService.getDocument(id)
  )

  ipcMain.handle('documents:import', async (event: IpcMainInvokeEvent, filePath: string) => {
    const name = filePath.split('/').pop() ?? 'document'
    const mime = (lookup(name) as string) || 'application/octet-stream'
    const doc = DocumentService.importDocument(filePath, name, mime)
    // process async, send progress event
    DocumentService.processDocument(doc.id).then(() => {
      event.sender.send('documents:processed', { id: doc.id })
    })
    return doc
  })

  ipcMain.handle('documents:pick', async (event: IpcMainInvokeEvent) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Documents', extensions: ['pdf', 'docx', 'doc', 'txt'] }],
    })
    if (result.canceled) return []

    const docs = []
    for (const filePath of result.filePaths) {
      const name = filePath.split('/').pop() ?? 'document'
      const mime = (lookup(name) as string) || 'application/octet-stream'
      const doc = DocumentService.importDocument(filePath, name, mime)
      DocumentService.processDocument(doc.id).then(() => {
        event.sender.send('documents:processed', { id: doc.id })
      })
      docs.push(doc)
    }
    return docs
  })

  ipcMain.handle('documents:delete', (_e: IpcMainInvokeEvent, id: string) =>
    DocumentService.deleteDocument(id)
  )

  ipcMain.handle('documents:rename', (_e: IpcMainInvokeEvent, id: string, name: string) =>
    DocumentService.renameDocument(id, name)
  )

  ipcMain.handle('documents:versions', (_e: IpcMainInvokeEvent, documentId: string) =>
    DocumentService.listVersions(documentId)
  )
}
```

- [ ] **Step 2: Register in IPC index**

Update `src/main/ipc-handlers/index.ts` to import and call `registerDocumentHandlers()`.

- [ ] **Step 3: Add documents to preload**

In `src/preload/index.ts`, add a `documents` section to the `contextBridge.exposeInMainWorld` call:

```typescript
documents: {
  list: () => ipcRenderer.invoke('documents:list'),
  get: (id: string) => ipcRenderer.invoke('documents:get', id),
  import: (filePath: string) => ipcRenderer.invoke('documents:import', filePath),
  pick: () => ipcRenderer.invoke('documents:pick'),
  delete: (id: string) => ipcRenderer.invoke('documents:delete', id),
  rename: (id: string, name: string) => ipcRenderer.invoke('documents:rename', id, name),
  versions: (id: string) => ipcRenderer.invoke('documents:versions', id),
  onProcessed: (cb: (data: { id: string }) => void) => {
    ipcRenderer.on('documents:processed', (_e, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('documents:processed')
  },
},
```

- [ ] **Step 4: Add types to env.d.ts**

Add to the `arc` window interface:

```typescript
documents: {
  list: () => Promise<Document[]>
  get: (id: string) => Promise<Document | undefined>
  import: (filePath: string) => Promise<Document>
  pick: () => Promise<Document[]>
  delete: (id: string) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
  versions: (id: string) => Promise<DocumentVersion[]>
  onProcessed: (cb: (data: { id: string }) => void) => () => void
}
```

With these interfaces at the top of env.d.ts:

```typescript
interface Document {
  id: string
  name: string
  mime_type: string
  file_path: string
  text_content: string | null
  page_count: number | null
  status: 'pending' | 'processing' | 'done' | 'error'
  error_message: string | null
  created_at: string
  updated_at: string
}

interface DocumentVersion {
  id: string
  document_id: string
  version_number: number
  file_path: string
  label: string | null
  created_at: string
}
```

- [ ] **Step 5: Build check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat: document IPC handlers and preload bridge"
```

---

### Task 7: VaultPage UI

**Files:**
- Modify: `src/renderer/pages/VaultPage.tsx`
- Create: `src/renderer/hooks/useDocuments.ts`
- Create: `src/renderer/components/documents/DocumentCard.tsx`

- [ ] **Step 1: Write useDocuments hook**

Create `src/renderer/hooks/useDocuments.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react'

export function useDocuments() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const docs = await window.arc.documents.list()
    setDocuments(docs)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const off = window.arc.documents.onProcessed(() => refresh())
    return off
  }, [refresh])

  const pickAndImport = useCallback(async () => {
    await window.arc.documents.pick()
    await refresh()
  }, [refresh])

  const remove = useCallback(async (id: string) => {
    await window.arc.documents.delete(id)
    await refresh()
  }, [refresh])

  return { documents, loading, refresh, pickAndImport, remove }
}
```

- [ ] **Step 2: Write DocumentCard**

Create `src/renderer/components/documents/DocumentCard.tsx`:

```typescript
import React from 'react'

interface Props {
  doc: Document
  onDelete: (id: string) => void
}

const statusColors = {
  pending: 'bg-gray-100 text-gray-500',
  processing: 'bg-yellow-100 text-yellow-700',
  done: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
}

export function DocumentCard({ doc, onDelete }: Props) {
  const ext = doc.name.split('.').pop()?.toUpperCase() ?? 'FILE'

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 group">
      <div className="w-10 h-10 rounded bg-blue-50 flex items-center justify-center text-xs font-bold text-blue-600 shrink-0">
        {ext}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
        <p className="text-xs text-gray-400">
          {doc.page_count ? `${doc.page_count} pages · ` : ''}
          {new Date(doc.created_at).toLocaleDateString()}
        </p>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[doc.status]}`}>
        {doc.status}
      </span>
      <button
        onClick={() => onDelete(doc.id)}
        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
        aria-label="Delete document"
      >
        ✕
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Write VaultPage**

Replace `src/renderer/pages/VaultPage.tsx`:

```typescript
import React from 'react'
import { useDocuments } from '../hooks/useDocuments'
import { DocumentCard } from '../components/documents/DocumentCard'

export function VaultPage() {
  const { documents, loading, pickAndImport, remove } = useDocuments()

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h1 className="text-lg font-semibold text-gray-900">Document Vault</h1>
        <button
          onClick={pickAndImport}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Import Documents
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <p className="text-gray-400 text-sm">No documents yet.</p>
            <p className="text-gray-300 text-xs mt-1">Import a PDF or DOCX to get started.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {documents.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} onDelete={remove} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```
Navigate to Vault in sidebar — import a PDF — verify it appears with processing status that updates to "done".

- [ ] **Step 5: Commit**

```bash
git add src/renderer/
git commit -m "feat: VaultPage with document import, processing status, and delete"
```

---

## Phase 3 — Workflows

### Task 8: WorkflowService + built-in workflows

**Files:**
- Create: `src/main/services/WorkflowService.ts`
- Create: `src/main/ipc-handlers/workflows.ts`

- [ ] **Step 1: Write WorkflowService**

Create `src/main/services/WorkflowService.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'

export interface Workflow {
  id: string
  name: string
  description: string
  type: 'assistant' | 'tabular'
  system_prompt: string
  columns_json: string
  is_builtin: number
  created_at: string
  updated_at: string
}

const BUILTINS: Omit<Workflow, 'id' | 'created_at' | 'updated_at'>[] = [
  {
    name: 'Contract Review',
    description: 'Review a contract for key terms, risks, and obligations.',
    type: 'assistant',
    system_prompt: 'You are an expert contract lawyer. Review the provided document carefully. Identify key obligations, payment terms, termination clauses, liability caps, and any unusual or risky provisions. Be precise and cite specific sections.',
    columns_json: '[]',
    is_builtin: 1,
  },
  {
    name: 'Executive Summary',
    description: 'Summarize a document for a senior executive.',
    type: 'assistant',
    system_prompt: 'You are a concise executive assistant. Summarize the document in plain English for a busy executive: key points, decisions required, risks, and recommended actions. Use bullet points. Maximum 300 words.',
    columns_json: '[]',
    is_builtin: 1,
  },
  {
    name: 'Compliance Check',
    description: 'Check a document for regulatory compliance issues.',
    type: 'assistant',
    system_prompt: 'You are a compliance officer. Review this document for regulatory issues, missing disclosures, ambiguous language that could create liability, and any provisions that conflict with standard regulatory requirements. List each issue with the relevant section reference.',
    columns_json: '[]',
    is_builtin: 1,
  },
]

export function seedBuiltins(): void {
  const db = getDb()
  for (const w of BUILTINS) {
    const exists = db.prepare('SELECT id FROM workflows WHERE name = ? AND is_builtin = 1').get(w.name)
    if (!exists) {
      const id = uuidv4()
      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO workflows (id, name, description, type, system_prompt, columns_json, is_builtin, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, w.name, w.description, w.type, w.system_prompt, w.columns_json, w.is_builtin, now, now)
    }
  }
}

export function listWorkflows(): Workflow[] {
  const db = getDb()
  return db.prepare('SELECT * FROM workflows ORDER BY is_builtin DESC, name ASC').all() as Workflow[]
}

export function getWorkflow(id: string): Workflow | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as Workflow | undefined
}

export function createWorkflow(data: { name: string; description: string; type: 'assistant' | 'tabular'; system_prompt: string }): Workflow {
  const db = getDb()
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO workflows (id, name, description, type, system_prompt, columns_json, is_builtin, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, '[]', 0, ?, ?)
  `).run(id, data.name, data.description, data.type, data.system_prompt, now, now)
  return getWorkflow(id)!
}

export function updateWorkflow(id: string, data: Partial<{ name: string; description: string; system_prompt: string }>): void {
  const db = getDb()
  const fields = Object.entries(data).map(([k]) => `${k} = ?`).join(', ')
  const values = [...Object.values(data), new Date().toISOString(), id]
  db.prepare(`UPDATE workflows SET ${fields}, updated_at = ? WHERE id = ? AND is_builtin = 0`).run(...values)
}

export function deleteWorkflow(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM workflows WHERE id = ? AND is_builtin = 0').run(id)
}
```

- [ ] **Step 2: Call seedBuiltins on startup**

In `src/main/index.ts`, after `getDb()`:

```typescript
import { seedBuiltins } from './services/WorkflowService'
// ...
getDb()
seedBuiltins()
```

- [ ] **Step 3: Write workflow IPC handlers**

Create `src/main/ipc-handlers/workflows.ts`:

```typescript
import { ipcMain, IpcMainInvokeEvent } from 'electron'
import * as WorkflowService from '../services/WorkflowService'

export function registerWorkflowHandlers(): void {
  ipcMain.handle('workflows:list', () => WorkflowService.listWorkflows())
  ipcMain.handle('workflows:get', (_e: IpcMainInvokeEvent, id: string) => WorkflowService.getWorkflow(id))
  ipcMain.handle('workflows:create', (_e: IpcMainInvokeEvent, data: Parameters<typeof WorkflowService.createWorkflow>[0]) => WorkflowService.createWorkflow(data))
  ipcMain.handle('workflows:update', (_e: IpcMainInvokeEvent, id: string, data: Parameters<typeof WorkflowService.updateWorkflow>[1]) => WorkflowService.updateWorkflow(id, data))
  ipcMain.handle('workflows:delete', (_e: IpcMainInvokeEvent, id: string) => WorkflowService.deleteWorkflow(id))
}
```

- [ ] **Step 4: Register + preload + types**

Register in `ipc-handlers/index.ts`. Add to preload:

```typescript
workflows: {
  list: () => ipcRenderer.invoke('workflows:list'),
  get: (id: string) => ipcRenderer.invoke('workflows:get', id),
  create: (data: { name: string; description: string; type: 'assistant' | 'tabular'; system_prompt: string }) => ipcRenderer.invoke('workflows:create', data),
  update: (id: string, data: Partial<{ name: string; description: string; system_prompt: string }>) => ipcRenderer.invoke('workflows:update', id, data),
  delete: (id: string) => ipcRenderer.invoke('workflows:delete', id),
},
```

Add `Workflow` interface to env.d.ts:

```typescript
interface Workflow {
  id: string
  name: string
  description: string
  type: 'assistant' | 'tabular'
  system_prompt: string
  columns_json: string
  is_builtin: number
  created_at: string
  updated_at: string
}
```

And add `workflows` to the `arc` window interface:

```typescript
workflows: {
  list: () => Promise<Workflow[]>
  get: (id: string) => Promise<Workflow | undefined>
  create: (data: { name: string; description: string; type: 'assistant' | 'tabular'; system_prompt: string }) => Promise<Workflow>
  update: (id: string, data: Partial<{ name: string; description: string; system_prompt: string }>) => Promise<void>
  delete: (id: string) => Promise<void>
}
```

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat: WorkflowService with built-in presets, IPC handlers, and preload bridge"
```

---

### Task 9: WorkflowsPage UI

**Files:**
- Modify: `src/renderer/pages/VaultPage.tsx` (already done)
- Create: `src/renderer/pages/WorkflowsPage.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Write WorkflowsPage**

Create `src/renderer/pages/WorkflowsPage.tsx`:

```typescript
import React, { useEffect, useState, useCallback } from 'react'

export function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', system_prompt: '' })

  const refresh = useCallback(async () => {
    setWorkflows(await window.arc.workflows.list())
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await window.arc.workflows.create({ ...form, type: 'assistant' })
    setForm({ name: '', description: '', system_prompt: '' })
    setCreating(false)
    await refresh()
  }

  const handleDelete = async (id: string) => {
    await window.arc.workflows.delete(id)
    await refresh()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h1 className="text-lg font-semibold text-gray-900">Workflows</h1>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          + New Workflow
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3">
        {creating && (
          <form onSubmit={handleCreate} className="p-4 border border-blue-200 rounded-lg bg-blue-50 flex flex-col gap-3">
            <input
              className="border border-gray-200 rounded px-3 py-2 text-sm w-full"
              placeholder="Workflow name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <input
              className="border border-gray-200 rounded px-3 py-2 text-sm w-full"
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            <textarea
              className="border border-gray-200 rounded px-3 py-2 text-sm w-full h-32 resize-none"
              placeholder="System prompt — instructions for the AI"
              value={form.system_prompt}
              onChange={(e) => setForm((f) => ({ ...f, system_prompt: e.target.value }))}
              required
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setCreating(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Save</button>
            </div>
          </form>
        )}

        {workflows.map((wf) => (
          <div key={wf.id} className="p-4 border border-gray-100 rounded-lg hover:bg-gray-50 group">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900">{wf.name}</p>
                  {wf.is_builtin ? (
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">built-in</span>
                  ) : null}
                </div>
                {wf.description ? <p className="text-xs text-gray-400 mt-0.5">{wf.description}</p> : null}
              </div>
              {!wf.is_builtin && (
                <button
                  onClick={() => handleDelete(wf.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs"
                >
                  Delete
                </button>
              )}
            </div>
            {wf.system_prompt && (
              <p className="text-xs text-gray-400 mt-2 line-clamp-2 font-mono">{wf.system_prompt}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add WorkflowsPage to App.tsx**

In `src/renderer/App.tsx`, add `'workflows'` to the `View` type and render `<WorkflowsPage />` when `view === 'workflows'`. Import `WorkflowsPage`. Pass `onNavigate` the `'workflows'` option from the Sidebar.

- [ ] **Step 3: Add Workflows nav item to Sidebar**

In `src/renderer/components/Sidebar.tsx`, add a "Workflows" nav button that calls `onNavigate('workflows')`.

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```
Navigate to Workflows — see built-in presets — create a custom workflow — verify it appears.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/
git commit -m "feat: WorkflowsPage with create/delete and built-in presets visible"
```

---

## Phase 4 — Tabular Reviews

### Task 10: TabularService

**Files:**
- Create: `src/main/services/TabularService.ts`
- Create: `src/main/ipc-handlers/tabular.ts`

- [ ] **Step 1: Write TabularService**

Create `src/main/services/TabularService.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'
import { getDocument } from './DocumentService'
import { streamChat } from './ModelGateway'

export interface ColumnDef {
  key: string
  name: string
  prompt: string
  type: 'text' | 'flag' | 'number'
}

export interface TabularReview {
  id: string
  name: string
  columns_json: string
  document_ids_json: string
  workflow_id: string | null
  created_at: string
  updated_at: string
}

export interface TabularCell {
  id: string
  review_id: string
  document_id: string
  column_key: string
  status: 'pending' | 'generating' | 'done' | 'error'
  content_json: string | null
  created_at: string
  updated_at: string
}

export function listReviews(): TabularReview[] {
  const db = getDb()
  return db.prepare('SELECT * FROM tabular_reviews ORDER BY created_at DESC').all() as TabularReview[]
}

export function getReview(id: string): TabularReview | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM tabular_reviews WHERE id = ?').get(id) as TabularReview | undefined
}

export function createReview(name: string, columns: ColumnDef[], documentIds: string[]): TabularReview {
  const db = getDb()
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO tabular_reviews (id, name, columns_json, document_ids_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name, JSON.stringify(columns), JSON.stringify(documentIds), now, now)

  // Pre-create all cells as pending
  for (const docId of documentIds) {
    for (const col of columns) {
      const cellId = uuidv4()
      db.prepare(`
        INSERT OR IGNORE INTO tabular_cells (id, review_id, document_id, column_key, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?)
      `).run(cellId, id, docId, col.key, now, now)
    }
  }

  return getReview(id)!
}

export function deleteReview(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM tabular_reviews WHERE id = ?').run(id)
}

export function getReviewCells(reviewId: string): TabularCell[] {
  const db = getDb()
  return db.prepare('SELECT * FROM tabular_cells WHERE review_id = ?').all(reviewId) as TabularCell[]
}

export async function generateCell(
  reviewId: string,
  documentId: string,
  columnKey: string,
  onChunk: (chunk: string) => void
): Promise<void> {
  const db = getDb()
  const review = getReview(reviewId)
  if (!review) throw new Error('Review not found')

  const columns: ColumnDef[] = JSON.parse(review.columns_json)
  const col = columns.find((c) => c.key === columnKey)
  if (!col) throw new Error('Column not found')

  const doc = getDocument(documentId)
  if (!doc || !doc.text_content) throw new Error('Document not processed yet')

  db.prepare(`UPDATE tabular_cells SET status = 'generating', updated_at = ? WHERE review_id = ? AND document_id = ? AND column_key = ?`)
    .run(new Date().toISOString(), reviewId, documentId, columnKey)

  const systemPrompt = `You are a precise document analyst. Answer the question about the document in JSON only.
Return exactly this JSON structure, no other text:
{"summary": "brief answer", "flag": "none|low|medium|high", "reasoning": "one sentence explaining your answer"}

Document: ${doc.name}
---
${doc.text_content.slice(0, 8000)}`

  const question = col.prompt

  let fullText = ''

  await streamChat({
    messages: [{ role: 'user', content: question }],
    systemPrompt,
    onChunk: (chunk) => {
      fullText += chunk
      onChunk(chunk)
    },
    onDone: (text) => {
      let content = null
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) content = JSON.parse(jsonMatch[0])
      } catch { content = { summary: text, flag: 'none', reasoning: '' } }
      db.prepare(`UPDATE tabular_cells SET status = 'done', content_json = ?, updated_at = ? WHERE review_id = ? AND document_id = ? AND column_key = ?`)
        .run(JSON.stringify(content), new Date().toISOString(), reviewId, documentId, columnKey)
    },
    onError: (err) => {
      db.prepare(`UPDATE tabular_cells SET status = 'error', content_json = ?, updated_at = ? WHERE review_id = ? AND document_id = ? AND column_key = ?`)
        .run(JSON.stringify({ summary: err.message, flag: 'none', reasoning: '' }), new Date().toISOString(), reviewId, documentId, columnKey)
    },
  })
}
```

- [ ] **Step 2: Write tabular IPC handlers**

Create `src/main/ipc-handlers/tabular.ts`:

```typescript
import { ipcMain, IpcMainInvokeEvent } from 'electron'
import * as TabularService from '../services/TabularService'

export function registerTabularHandlers(): void {
  ipcMain.handle('tabular:list', () => TabularService.listReviews())
  ipcMain.handle('tabular:get', (_e: IpcMainInvokeEvent, id: string) => TabularService.getReview(id))
  ipcMain.handle('tabular:create', (_e: IpcMainInvokeEvent, name: string, columns: TabularService.ColumnDef[], documentIds: string[]) =>
    TabularService.createReview(name, columns, documentIds))
  ipcMain.handle('tabular:delete', (_e: IpcMainInvokeEvent, id: string) => TabularService.deleteReview(id))
  ipcMain.handle('tabular:cells', (_e: IpcMainInvokeEvent, reviewId: string) => TabularService.getReviewCells(reviewId))

  ipcMain.handle('tabular:generateCell', async (event: IpcMainInvokeEvent, reviewId: string, documentId: string, columnKey: string) => {
    await TabularService.generateCell(reviewId, documentId, columnKey, (chunk) => {
      event.sender.send('tabular:cellChunk', { reviewId, documentId, columnKey, chunk })
    })
    event.sender.send('tabular:cellDone', { reviewId, documentId, columnKey })
  })
}
```

- [ ] **Step 3: Register + preload + types**

Register in `ipc-handlers/index.ts`. Add to preload:

```typescript
tabular: {
  list: () => ipcRenderer.invoke('tabular:list'),
  get: (id: string) => ipcRenderer.invoke('tabular:get', id),
  create: (name: string, columns: ColumnDef[], documentIds: string[]) => ipcRenderer.invoke('tabular:create', name, columns, documentIds),
  delete: (id: string) => ipcRenderer.invoke('tabular:delete', id),
  cells: (reviewId: string) => ipcRenderer.invoke('tabular:cells', reviewId),
  generateCell: (reviewId: string, documentId: string, columnKey: string) => ipcRenderer.invoke('tabular:generateCell', reviewId, documentId, columnKey),
  onCellChunk: (cb: (d: { reviewId: string; documentId: string; columnKey: string; chunk: string }) => void) => {
    ipcRenderer.on('tabular:cellChunk', (_e, d) => cb(d))
    return () => ipcRenderer.removeAllListeners('tabular:cellChunk')
  },
  onCellDone: (cb: (d: { reviewId: string; documentId: string; columnKey: string }) => void) => {
    ipcRenderer.on('tabular:cellDone', (_e, d) => cb(d))
    return () => ipcRenderer.removeAllListeners('tabular:cellDone')
  },
},
```

Add interfaces to `env.d.ts`:

```typescript
interface ColumnDef {
  key: string
  name: string
  prompt: string
  type: 'text' | 'flag' | 'number'
}

interface TabularReview {
  id: string
  name: string
  columns_json: string
  document_ids_json: string
  workflow_id: string | null
  created_at: string
  updated_at: string
}

interface TabularCell {
  id: string
  review_id: string
  document_id: string
  column_key: string
  status: 'pending' | 'generating' | 'done' | 'error'
  content_json: string | null
  created_at: string
  updated_at: string
}
```

Add `tabular` to `arc` window interface accordingly.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat: TabularService with cell generation, IPC handlers, preload bridge"
```

---

### Task 11: TabularPage UI

**Files:**
- Create: `src/renderer/pages/TabularPage.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Write TabularPage**

Create `src/renderer/pages/TabularPage.tsx`:

```typescript
import React, { useEffect, useState, useCallback } from 'react'

const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'parties', name: 'Parties', prompt: 'Who are the parties to this document?', type: 'text' },
  { key: 'governing_law', name: 'Governing Law', prompt: 'What is the governing law?', type: 'text' },
  { key: 'risk_level', name: 'Risk Level', prompt: 'What is the overall risk level of this document?', type: 'flag' },
]

export function TabularPage() {
  const [reviews, setReviews] = useState<TabularReview[]>([])
  const [activeReview, setActiveReview] = useState<TabularReview | null>(null)
  const [cells, setCells] = useState<TabularCell[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])

  const refreshReviews = useCallback(async () => {
    setReviews(await window.arc.tabular.list())
  }, [])

  const refreshCells = useCallback(async (reviewId: string) => {
    setCells(await window.arc.tabular.cells(reviewId))
  }, [])

  useEffect(() => {
    refreshReviews()
    window.arc.documents.list().then(setDocuments)
  }, [refreshReviews])

  useEffect(() => {
    const offDone = window.arc.tabular.onCellDone(({ reviewId }) => {
      if (activeReview?.id === reviewId) refreshCells(reviewId)
    })
    return offDone
  }, [activeReview, refreshCells])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const review = await window.arc.tabular.create(newName, DEFAULT_COLUMNS, selectedDocIds)
    setCreating(false)
    setNewName('')
    setSelectedDocIds([])
    await refreshReviews()
    handleSelectReview(review)
  }

  const handleSelectReview = async (review: TabularReview) => {
    setActiveReview(review)
    await refreshCells(review.id)
  }

  const handleGenerateAll = async () => {
    if (!activeReview) return
    const cols: ColumnDef[] = JSON.parse(activeReview.columns_json)
    const docIds: string[] = JSON.parse(activeReview.document_ids_json)
    for (const docId of docIds) {
      for (const col of cols) {
        window.arc.tabular.generateCell(activeReview.id, docId, col.key)
      }
    }
  }

  const handleRegenerateCell = (docId: string, colKey: string) => {
    if (!activeReview) return
    window.arc.tabular.generateCell(activeReview.id, docId, colKey)
  }

  if (activeReview) {
    const cols: ColumnDef[] = JSON.parse(activeReview.columns_json)
    const docIds: string[] = JSON.parse(activeReview.document_ids_json)
    const docMap = Object.fromEntries(documents.map((d) => [d.id, d]))

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <button onClick={() => setActiveReview(null)} className="text-sm text-gray-400 hover:text-gray-700">← Back</button>
          <h1 className="text-lg font-semibold text-gray-900 flex-1">{activeReview.name}</h1>
          <button onClick={handleGenerateAll} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            Generate All
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2 font-medium text-gray-700 w-48">Document</th>
                {cols.map((col) => (
                  <th key={col.key} className="text-left px-4 py-2 font-medium text-gray-700">{col.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docIds.map((docId) => (
                <tr key={docId} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 truncate max-w-48">
                    {docMap[docId]?.name ?? docId}
                  </td>
                  {cols.map((col) => {
                    const cell = cells.find((c) => c.document_id === docId && c.column_key === col.key)
                    const content = cell?.content_json ? JSON.parse(cell.content_json) : null
                    return (
                      <td key={col.key} className="px-4 py-3 align-top group relative">
                        {cell?.status === 'generating' ? (
                          <span className="text-gray-400 text-xs animate-pulse">Generating…</span>
                        ) : cell?.status === 'done' && content ? (
                          <div>
                            {col.type === 'flag' ? (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                content.flag === 'high' ? 'bg-red-100 text-red-700' :
                                content.flag === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                content.flag === 'low' ? 'bg-blue-100 text-blue-700' :
                                'bg-gray-100 text-gray-500'
                              }`}>{content.flag}</span>
                            ) : (
                              <p className="text-gray-700">{content.summary}</p>
                            )}
                          </div>
                        ) : cell?.status === 'error' ? (
                          <span className="text-red-500 text-xs">Error</span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                        <button
                          onClick={() => handleRegenerateCell(docId, col.key)}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-blue-600"
                        >
                          ↺
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h1 className="text-lg font-semibold text-gray-900">Tabular Reviews</h1>
        <button onClick={() => setCreating(true)} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          + New Review
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3">
        {creating && (
          <form onSubmit={handleCreate} className="p-4 border border-blue-200 rounded-lg bg-blue-50 flex flex-col gap-3">
            <input
              className="border border-gray-200 rounded px-3 py-2 text-sm w-full"
              placeholder="Review name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Select documents:</p>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {documents.filter((d) => d.status === 'done').map((doc) => (
                  <label key={doc.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedDocIds.includes(doc.id)}
                      onChange={(e) => setSelectedDocIds((prev) =>
                        e.target.checked ? [...prev, doc.id] : prev.filter((id) => id !== doc.id)
                      )}
                    />
                    {doc.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setCreating(false)} className="px-3 py-1.5 text-sm text-gray-600">Cancel</button>
              <button type="submit" disabled={selectedDocIds.length === 0} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">Create</button>
            </div>
          </form>
        )}
        {reviews.map((r) => (
          <button
            key={r.id}
            onClick={() => handleSelectReview(r)}
            className="text-left p-4 border border-gray-100 rounded-lg hover:bg-gray-50"
          >
            <p className="text-sm font-medium text-gray-900">{r.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {JSON.parse(r.document_ids_json).length} documents · {JSON.parse(r.columns_json).length} columns
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add to App.tsx**

Add `'tabular'` to View type. Render `<TabularPage />` when `view === 'tabular'`. Add Tabular nav item to Sidebar.

- [ ] **Step 3: Smoke test**

```bash
npm run dev
```
Create a tabular review with 2+ processed documents — click Generate All — verify cells populate.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/
git commit -m "feat: TabularPage — create reviews, generate cells, regenerate individual cells"
```

---

## Phase 5 — Tracked-Changes Editing

### Task 12: Edit proposal flow in ChatService + DocumentService

**Files:**
- Modify: `src/main/services/ChatService.ts`
- Modify: `src/main/services/DocumentService.ts`
- Modify: `src/main/ipc-handlers/chat.ts`

- [ ] **Step 1: Add applyDocumentEdit to DocumentService**

Add to `src/main/services/DocumentService.ts`:

```typescript
import { writeFile } from 'fs/promises'

export interface EditProposal {
  document_id: string
  original_snippet: string
  replacement_text: string
  rationale: string
}

export async function applyEdit(proposal: EditProposal): Promise<DocumentVersion> {
  const doc = getDocument(proposal.document_id)
  if (!doc || !doc.text_content) throw new Error('Document not processed')

  const updated = doc.text_content.replace(proposal.original_snippet, proposal.replacement_text)
  if (updated === doc.text_content) throw new Error('Original snippet not found in document — cannot apply edit')

  const db = getDb()
  db.prepare(`UPDATE documents SET text_content = ?, updated_at = ? WHERE id = ?`)
    .run(updated, new Date().toISOString(), proposal.document_id)

  // Write updated text to a new file
  const ext = doc.file_path.split('.').pop() ?? 'txt'
  const newPath = join(vaultDir(), `${proposal.document_id}_edit_${Date.now()}.${ext}`)
  await writeFile(newPath, updated, 'utf8')

  return createVersion(proposal.document_id, newPath, 'AI Edit')
}
```

- [ ] **Step 2: Add requestEdit IPC handler**

In `src/main/ipc-handlers/chat.ts`, add a handler that asks the model to produce a structured edit proposal:

```typescript
ipcMain.handle('chat:requestEdit', async (event: IpcMainInvokeEvent, { documentId, instruction }: { documentId: string; instruction: string }) => {
  const DocumentService = await import('../services/DocumentService')
  const doc = DocumentService.getDocument(documentId)
  if (!doc || !doc.text_content) throw new Error('Document not ready')

  const systemPrompt = `You are a precise document editor. The user wants to make a specific edit to this document.
Return ONLY valid JSON with this exact structure, no other text:
{
  "original_snippet": "the exact text to find and replace (verbatim, max 200 chars)",
  "replacement_text": "the replacement text",
  "rationale": "one sentence explaining why this edit was made"
}

Document content:
${doc.text_content.slice(0, 6000)}`

  let fullText = ''
  await streamChat({
    messages: [{ role: 'user', content: instruction }],
    systemPrompt,
    onChunk: (chunk) => {
      fullText += chunk
      event.sender.send('chat:editChunk', { chunk })
    },
    onDone: (text) => {
      try {
        const match = text.match(/\{[\s\S]*\}/)
        const proposal = match ? JSON.parse(match[0]) : null
        event.sender.send('chat:editProposal', { documentId, proposal })
      } catch {
        event.sender.send('chat:editProposal', { documentId, proposal: null, error: 'Failed to parse edit proposal' })
      }
    },
    onError: (err) => event.sender.send('chat:editProposal', { documentId, proposal: null, error: err.message }),
  })
})

ipcMain.handle('chat:applyEdit', async (_e: IpcMainInvokeEvent, proposal: import('../services/DocumentService').EditProposal) => {
  const DocumentService = await import('../services/DocumentService')
  return DocumentService.applyEdit(proposal)
})
```

- [ ] **Step 3: Add to preload**

In `src/preload/index.ts`, add to `chat`:

```typescript
requestEdit: (args: { documentId: string; instruction: string }) => ipcRenderer.invoke('chat:requestEdit', args),
applyEdit: (proposal: { document_id: string; original_snippet: string; replacement_text: string; rationale: string }) => ipcRenderer.invoke('chat:applyEdit', proposal),
onEditProposal: (cb: (data: { documentId: string; proposal: EditProposal | null; error?: string }) => void) => {
  ipcRenderer.on('chat:editProposal', (_e, data) => cb(data))
  return () => ipcRenderer.removeAllListeners('chat:editProposal')
},
```

Add `EditProposal` interface to `env.d.ts`:

```typescript
interface EditProposal {
  document_id: string
  original_snippet: string
  replacement_text: string
  rationale: string
}
```

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat: tracked-changes edit proposal flow — request, parse, apply, version"
```

---

### Task 13: EditCard UI component + ChatPage integration

**Files:**
- Create: `src/renderer/components/documents/EditCard.tsx`
- Modify: `src/renderer/pages/ChatPage.tsx`

- [ ] **Step 1: Write EditCard**

Create `src/renderer/components/documents/EditCard.tsx`:

```typescript
import React, { useState } from 'react'

interface Props {
  documentId: string
  documentName: string
  onEditApplied: () => void
}

export function EditCard({ documentId, documentName, onEditApplied }: Props) {
  const [instruction, setInstruction] = useState('')
  const [proposal, setProposal] = useState<EditProposal | null>(null)
  const [loading, setLoading] = useState(false)
  const [applied, setApplied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setProposal(null)
    setError(null)

    const offProposal = window.arc.chat.onEditProposal(({ proposal: p, error: err }) => {
      setLoading(false)
      offProposal()
      if (err || !p) { setError(err ?? 'No proposal generated'); return }
      setProposal(p)
    })

    await window.arc.chat.requestEdit({ documentId, instruction })
  }

  const handleAccept = async () => {
    if (!proposal) return
    setLoading(true)
    try {
      await window.arc.chat.applyEdit(proposal)
      setApplied(true)
      onEditApplied()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  if (applied) {
    return (
      <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
        Edit applied and saved as a new version of "{documentName}".
      </div>
    )
  }

  return (
    <div className="p-3 border border-amber-200 bg-amber-50 rounded-lg flex flex-col gap-2">
      <p className="text-xs font-medium text-amber-800">Edit: {documentName}</p>
      {!proposal ? (
        <form onSubmit={handleRequest} className="flex gap-2">
          <input
            className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm bg-white"
            placeholder="Describe the edit…"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={loading}
          />
          <button type="submit" disabled={loading || !instruction} className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded hover:bg-amber-700 disabled:opacity-50">
            {loading ? '…' : 'Propose'}
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-gray-600 bg-white p-2 rounded border border-gray-200">
            <p className="font-medium text-red-500 line-through">{proposal.original_snippet}</p>
            <p className="font-medium text-green-600 mt-1">{proposal.replacement_text}</p>
            <p className="text-gray-400 mt-1 italic">{proposal.rationale}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAccept} disabled={loading} className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50">
              Accept
            </button>
            <button onClick={() => setProposal(null)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">
              Reject
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Add Edit button to ChatPage**

In `src/renderer/pages/ChatPage.tsx`, add a document selector and "Request Edit" button that renders `<EditCard />` inline below the chat input when a document is selected.

- [ ] **Step 3: Smoke test**

```bash
npm run dev
```
Import a text document — go to chat — request an edit — accept it — verify version appears in Vault.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/
git commit -m "feat: EditCard — AI-proposed tracked changes with accept/reject UI"
```

---

## Phase 6 — Settings: API Key Config + Model Selector

### Task 14: SettingsPage with API key inputs and model selector

**Files:**
- Modify: `src/renderer/pages/SettingsPage.tsx`

- [ ] **Step 1: Rewrite SettingsPage**

Replace `src/renderer/pages/SettingsPage.tsx`:

```typescript
import React, { useEffect, useState } from 'react'

interface Props {
  onClose: () => void
}

export function SettingsPage({ onClose }: Props) {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.arc.settings.getAll().then(setSettings)
  }, [])

  const update = (key: string, value: string) => {
    setSettings((s) => ({ ...s, [key]: value }))
    setSaved(false)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    for (const [key, value] of Object.entries(settings)) {
      await window.arc.settings.set(key, value)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h1 className="text-lg font-semibold text-gray-900">Settings</h1>
        <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-700">✕</button>
      </div>

      <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6">
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Model Provider</h2>
          <div className="flex flex-col gap-2">
            {['ollama', 'claude', 'gemini'].map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="model_provider"
                  value={p}
                  checked={settings['model_provider'] === p}
                  onChange={() => update('model_provider', p)}
                />
                {p === 'ollama' ? 'Local (Ollama — private, no API key required)' :
                 p === 'claude' ? 'Claude (Anthropic API key required)' :
                 'Gemini (Google API key required)'}
              </label>
            ))}
          </div>
        </section>

        {settings['model_provider'] === 'ollama' && (
          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Ollama Model</h2>
            <input
              className="border border-gray-200 rounded px-3 py-2 text-sm w-full"
              value={settings['ollama_model'] ?? ''}
              onChange={(e) => update('ollama_model', e.target.value)}
              placeholder="e.g. qwen2.5:7b"
            />
          </section>
        )}

        {settings['model_provider'] === 'claude' && (
          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Anthropic API Key</h2>
            <input
              type="password"
              className="border border-gray-200 rounded px-3 py-2 text-sm w-full font-mono"
              value={settings['claude_api_key'] ?? ''}
              onChange={(e) => update('claude_api_key', e.target.value)}
              placeholder="sk-ant-..."
            />
          </section>
        )}

        {settings['model_provider'] === 'gemini' && (
          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Google API Key</h2>
            <input
              type="password"
              className="border border-gray-200 rounded px-3 py-2 text-sm w-full font-mono"
              value={settings['gemini_api_key'] ?? ''}
              onChange={(e) => update('gemini_api_key', e.target.value)}
              placeholder="AIza..."
            />
          </section>
        )}

        <div>
          <button type="submit" className="px-6 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            {saved ? 'Saved ✓' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Smoke test**

```bash
npm run dev
```
Open Settings — switch to Claude — enter a fake key — save — verify settings persisted by re-opening settings.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/SettingsPage.tsx
git commit -m "feat: SettingsPage with model provider selector and API key inputs"
```

---

## Phase 7 — Meetings (Granola-style)

### Task 15: MeetingService skeleton

> Note: Full audio capture requires a native macOS audio addon or shell subprocess. This task implements the service layer and a working transcription + summary flow; audio capture uses a file-picker fallback if the native module is unavailable.

**Files:**
- Create: `src/main/services/MeetingService.ts`
- Create: `src/main/ipc-handlers/meetings.ts`

- [ ] **Step 1: Write MeetingService**

Create `src/main/services/MeetingService.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { writeFile, readFile } from 'fs/promises'
import { spawn } from 'child_process'
import { streamChat } from './ModelGateway'

export interface Meeting {
  id: string
  title: string
  audio_path: string | null
  transcript_path: string | null
  summary: string | null
  status: 'idle' | 'recording' | 'transcribing' | 'summarizing' | 'done' | 'error'
  started_at: string | null
  ended_at: string | null
  created_at: string
}

function meetingsDir(): string {
  const dir = join(app.getPath('userData'), 'meetings')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function listMeetings(): Meeting[] {
  const db = getDb()
  return db.prepare('SELECT * FROM meetings ORDER BY created_at DESC').all() as Meeting[]
}

export function getMeeting(id: string): Meeting | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as Meeting | undefined
}

export function createMeeting(title = 'Untitled Meeting'): Meeting {
  const db = getDb()
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO meetings (id, title, status, created_at) VALUES (?, ?, 'idle', ?)
  `).run(id, title, now)
  return getMeeting(id)!
}

export async function transcribeAudio(meetingId: string, audioPath: string, whisperBin: string): Promise<string> {
  const db = getDb()
  db.prepare(`UPDATE meetings SET status = 'transcribing', audio_path = ? WHERE id = ?`).run(audioPath, meetingId)

  return new Promise((resolve, reject) => {
    const transcriptPath = join(meetingsDir(), `${meetingId}.txt`)
    const proc = spawn(whisperBin, ['-m', 'models/ggml-base.en.bin', '-f', audioPath, '-otxt', '-of', transcriptPath.replace('.txt', '')], {
      cwd: meetingsDir(),
    })

    proc.on('close', async (code) => {
      if (code !== 0) {
        db.prepare(`UPDATE meetings SET status = 'error' WHERE id = ?`).run(meetingId)
        reject(new Error(`Whisper exited with code ${code}`))
        return
      }
      db.prepare(`UPDATE meetings SET transcript_path = ? WHERE id = ?`).run(transcriptPath, meetingId)
      const text = await readFile(transcriptPath, 'utf8')
      resolve(text)
    })
  })
}

export async function summarizeMeeting(
  meetingId: string,
  transcript: string,
  onChunk: (chunk: string) => void
): Promise<void> {
  const db = getDb()
  db.prepare(`UPDATE meetings SET status = 'summarizing' WHERE id = ?`).run(meetingId)

  const systemPrompt = `You are an expert meeting summarizer. Given a transcript, produce:
1. A 2-3 sentence executive summary
2. Key decisions made (bullet list)
3. Action items with owners if mentioned (bullet list)
4. Open questions (bullet list)

Be concise. Use markdown formatting.`

  await streamChat({
    messages: [{ role: 'user', content: `Transcript:\n\n${transcript.slice(0, 12000)}` }],
    systemPrompt,
    onChunk,
    onDone: (fullText) => {
      db.prepare(`UPDATE meetings SET status = 'done', summary = ?, ended_at = ? WHERE id = ?`)
        .run(fullText, new Date().toISOString(), meetingId)
    },
    onError: (err) => {
      db.prepare(`UPDATE meetings SET status = 'error' WHERE id = ?`).run(meetingId)
    },
  })
}

export function deleteMeeting(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM meetings WHERE id = ?').run(id)
}
```

- [ ] **Step 2: Write meetings IPC handlers**

Create `src/main/ipc-handlers/meetings.ts`:

```typescript
import { ipcMain, IpcMainInvokeEvent, dialog } from 'electron'
import * as MeetingService from '../services/MeetingService'
import { join } from 'path'
import { app } from 'electron'

function whisperBin(): string {
  return join(app.getAppPath(), 'resources', 'whisper', 'whisper')
}

export function registerMeetingHandlers(): void {
  ipcMain.handle('meetings:list', () => MeetingService.listMeetings())
  ipcMain.handle('meetings:get', (_e: IpcMainInvokeEvent, id: string) => MeetingService.getMeeting(id))
  ipcMain.handle('meetings:create', (_e: IpcMainInvokeEvent, title?: string) => MeetingService.createMeeting(title))
  ipcMain.handle('meetings:delete', (_e: IpcMainInvokeEvent, id: string) => MeetingService.deleteMeeting(id))

  ipcMain.handle('meetings:importAndProcess', async (event: IpcMainInvokeEvent) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'm4a', 'ogg'] }],
    })
    if (result.canceled) return null

    const audioPath = result.filePaths[0]
    const meeting = MeetingService.createMeeting('Imported Meeting')

    try {
      const transcript = await MeetingService.transcribeAudio(meeting.id, audioPath, whisperBin())
      await MeetingService.summarizeMeeting(meeting.id, transcript, (chunk) => {
        event.sender.send('meetings:summaryChunk', { meetingId: meeting.id, chunk })
      })
      event.sender.send('meetings:done', { meetingId: meeting.id })
    } catch (err) {
      event.sender.send('meetings:error', { meetingId: meeting.id, error: String(err) })
    }

    return MeetingService.getMeeting(meeting.id)
  })
}
```

- [ ] **Step 3: Register + preload + types**

Register in `ipc-handlers/index.ts`. Add to preload:

```typescript
meetings: {
  list: () => ipcRenderer.invoke('meetings:list'),
  get: (id: string) => ipcRenderer.invoke('meetings:get', id),
  create: (title?: string) => ipcRenderer.invoke('meetings:create', title),
  delete: (id: string) => ipcRenderer.invoke('meetings:delete', id),
  importAndProcess: () => ipcRenderer.invoke('meetings:importAndProcess'),
  onSummaryChunk: (cb: (d: { meetingId: string; chunk: string }) => void) => {
    ipcRenderer.on('meetings:summaryChunk', (_e, d) => cb(d))
    return () => ipcRenderer.removeAllListeners('meetings:summaryChunk')
  },
  onDone: (cb: (d: { meetingId: string }) => void) => {
    ipcRenderer.on('meetings:done', (_e, d) => cb(d))
    return () => ipcRenderer.removeAllListeners('meetings:done')
  },
  onError: (cb: (d: { meetingId: string; error: string }) => void) => {
    ipcRenderer.on('meetings:error', (_e, d) => cb(d))
    return () => ipcRenderer.removeAllListeners('meetings:error')
  },
},
```

Add `Meeting` interface to `env.d.ts` and add `meetings` to `arc` window interface.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat: MeetingService — import audio, transcribe with Whisper, summarize with LLM"
```

---

### Task 16: MeetingsPage UI

**Files:**
- Modify: `src/renderer/pages/MeetingsPage.tsx`

- [ ] **Step 1: Write MeetingsPage**

Replace `src/renderer/pages/MeetingsPage.tsx`:

```typescript
import React, { useEffect, useState, useCallback } from 'react'

export function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null)
  const [processing, setProcessing] = useState(false)

  const refresh = useCallback(async () => {
    setMeetings(await window.arc.meetings.list())
  }, [])

  useEffect(() => {
    refresh()
    const offDone = window.arc.meetings.onDone(async ({ meetingId }) => {
      setProcessing(false)
      await refresh()
      const m = await window.arc.meetings.get(meetingId)
      if (m) setActiveMeeting(m)
    })
    const offError = window.arc.meetings.onError(() => setProcessing(false))
    return () => { offDone(); offError() }
  }, [refresh])

  const handleImport = async () => {
    setProcessing(true)
    const meeting = await window.arc.meetings.importAndProcess()
    if (!meeting) setProcessing(false)
  }

  const handleDelete = async (id: string) => {
    await window.arc.meetings.delete(id)
    if (activeMeeting?.id === id) setActiveMeeting(null)
    await refresh()
  }

  const statusLabel: Record<string, string> = {
    idle: 'Idle', recording: 'Recording…', transcribing: 'Transcribing…',
    summarizing: 'Summarizing…', done: 'Done', error: 'Error',
  }

  if (activeMeeting) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <button onClick={() => setActiveMeeting(null)} className="text-sm text-gray-400 hover:text-gray-700">← Back</button>
          <h1 className="text-lg font-semibold text-gray-900 flex-1">{activeMeeting.title}</h1>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeMeeting.summary ? (
            <div className="prose prose-sm max-w-none">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">{activeMeeting.summary}</pre>
            </div>
          ) : (
            <p className="text-sm text-gray-400">{statusLabel[activeMeeting.status] ?? activeMeeting.status}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h1 className="text-lg font-semibold text-gray-900">Meetings</h1>
        <button
          onClick={handleImport}
          disabled={processing}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {processing ? 'Processing…' : '+ Import Audio'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-2">
        {meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <p className="text-gray-400 text-sm">No meetings yet.</p>
            <p className="text-gray-300 text-xs mt-1">Import an audio file to transcribe and summarize it.</p>
          </div>
        ) : meetings.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 group cursor-pointer"
            onClick={() => setActiveMeeting(m)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{m.title}</p>
              <p className="text-xs text-gray-400">{new Date(m.created_at).toLocaleDateString()}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              m.status === 'done' ? 'bg-green-100 text-green-700' :
              m.status === 'error' ? 'bg-red-100 text-red-700' :
              'bg-yellow-100 text-yellow-700'
            }`}>{statusLabel[m.status]}</span>
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(m.id) }}
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs"
            >✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Smoke test**

```bash
npm run dev
```
Navigate to Meetings — import a WAV file — verify processing states update — view summary.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/MeetingsPage.tsx
git commit -m "feat: MeetingsPage — import audio, show processing status, view summary"
```

---

## Self-Review

**Spec coverage check:**
- ✅ A — Document vault (Tasks 5–7): import, extract text, version, VaultPage
- ✅ C — Workflows (Tasks 8–9): CRUD, built-in presets, apply via system prompt
- ✅ D — Tabular reviews (Tasks 10–11): create, generate cells, regenerate, flag rendering
- ✅ E — Tracked changes (Tasks 12–13): propose edit, accept/reject, version on accept
- ✅ Model gateway (Task 3): Ollama + Claude + Gemini unified
- ✅ Settings (Task 14): API key config, model selector
- ✅ Meetings (Tasks 15–16): import audio, transcribe, summarize

**Placeholder scan:** No TBD, TODO, or incomplete sections found.

**Type consistency:** All types defined in Task 4 (env.d.ts) match usage throughout Tasks 5–16. `EditProposal`, `ColumnDef`, `TabularCell`, `Workflow`, `Meeting`, `Document`, `DocumentVersion` are all defined before use.
