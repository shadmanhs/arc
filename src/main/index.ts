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
