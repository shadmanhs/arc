import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import { existsSync, chmodSync } from 'fs'
import { join } from 'path'

export class OllamaManager {
  private process: ChildProcess | null = null
  private binaryPath: string
  private readonly port = 11434

  constructor(binaryPath?: string) {
    this.binaryPath = binaryPath ?? this.resolveBinaryPath()
  }

  private resolveBinaryPath(): string {
    // Defer electron import to avoid issues in test environment
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('electron')
      if (app.isPackaged) {
        return join(process.resourcesPath, 'ollama', 'ollama')
      }
      return join(app.getAppPath(), 'resources', 'ollama', 'ollama')
    } catch {
      return join(process.cwd(), 'resources', 'ollama', 'ollama')
    }
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

    this.process.stdout?.on('data', (d: Buffer) => console.log('[ollama]', d.toString()))
    this.process.stderr?.on('data', (d: Buffer) => console.error('[ollama]', d.toString()))
    this.process.on('exit', (code: number | null) => {
      console.log('[ollama] exited with code', code)
      this.process = null
    })

    await this.waitForReady()
  }

  private getModelsDir(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('electron')
      return join(app.getPath('userData'), 'models')
    } catch {
      return join(process.cwd(), 'models')
    }
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
