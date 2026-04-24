import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

function getUserDataPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron')
    return app.getPath('userData')
  } catch {
    return join(process.cwd(), 'userData')
  }
}

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
    this.dir = join(getUserDataPath(), 'conversations')
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
    return (readdirSync(this.dir) as string[])
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
