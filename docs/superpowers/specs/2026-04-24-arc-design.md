# Arc — Private AI Desktop App: Design Spec

## Overview

Arc is a Mac-only Electron desktop app that gives professionals in regulated industries (law, finance, healthcare) a private, on-device AI assistant. No data ever leaves the machine. It combines two workflows: **document-grounded chat** (like Claude Desktop) and **meeting transcription + notes** (like Granola). Target users are non-technical professionals (40–70 years old) at firms with HIPAA or MNPI obligations.

---

## User Personas & Core Jobs To Be Done

**Primary user:** A 55-year-old M&A attorney or compliance officer.
- Wants to ask questions about documents without emailing them to a third party
- Wants meeting notes without a cloud service seeing their calls
- Is not technical — the app must just work, with no setup beyond installation

**Core JTBD:**
1. "Ask my AI a question about this contract" — drag PDF into chat, get an answer
2. "Summarize what was said in that call" — app recorded it locally, produces notes
3. "Search across everything I've given it" — the vault knows all their documents

---

## Architecture

### Electron Shell + Local Microservices

```
┌─────────────────────────────────────────┐
│         Electron App (Renderer)          │
│   React 18 + Tailwind CSS               │
└────────────┬────────────────────────────┘
             │ IPC (contextBridge)
┌────────────▼────────────────────────────┐
│         Electron Main Process            │
│  Spawns + manages all local services    │
└───┬──────────────┬──────────────┬───────┘
    │              │              │
┌───▼───┐    ┌─────▼─────┐  ┌───▼──────────┐
│Ollama │    │  Sidecar  │  │ Whisper.cpp  │
│(model │    │ (Node.js) │  │ (subprocess) │
│serving│    │RAG + DB   │  │              │
└───────┘    └───────────┘  └──────────────┘
```

- **Electron Main**: spawns Ollama, the RAG sidecar, and Whisper.cpp. Manages app lifecycle.
- **Renderer**: React UI, communicates via `ipcRenderer` / `contextBridge` only (no direct Node access)
- **Ollama**: bundled binary, starts on app launch, serves models on `localhost:11434`
- **RAG Sidecar**: separate Node.js process, runs LlamaIndex.TS + LanceDB on a local socket/port
- **Whisper.cpp**: spawned per recording session, writes transcript to local file

### Data Storage (all local, all on-device)

```
~/Library/Application Support/Arc/
├── models/          # Ollama model files (symlinked from ~/.ollama)
├── vault/           # User's document library
│   ├── originals/   # Original PDFs, DOCX files
│   └── lancedb/     # Vector embeddings
├── meetings/        # Transcripts + notes JSON
├── conversations/   # Chat history JSON files
└── config.json      # User preferences
```

---

## Screen Structure

### 1. Home Screen (default view)
- **Top**: Large chat input box with placeholder "Ask anything..."
- **Middle**: "Upcoming Meetings" section (pulled from Google/Outlook if connected, otherwise empty with "Connect calendar" prompt)
- **Bottom**: Recent conversations list + recent vault documents
- Privacy badge: small persistent label "All data stays on your Mac"

### 2. Chat Screen
- Standard chat interface (messages top to bottom, input at bottom)
- File drop zone: drag PDF/DOCX into chat for one-off document context
- Streaming responses from Ollama
- Source citations shown inline when RAG is used ("From: contract_v3.pdf, p.4")
- Each conversation saved to disk automatically

### 3. Vault Screen
- Grid of indexed documents
- "Add documents" button + drag-drop target
- Search bar (semantic search via LanceDB)
- Each document shows: name, date added, page count
- Right-click: Remove from vault

### 4. Meetings Screen
- List of past meetings (date, title, duration)
- "Start Recording" button — captures mic + system audio simultaneously
- Recording indicator in menu bar while active
- After stopping: shows transcript, then AI-generated summary + action items
- Each meeting saved locally as JSON

### 5. Settings Screen
- **Model**: Shows current model, "Recommended for your Mac" label. Advanced toggle reveals model picker.
- **Calendar**: Connect Google Calendar / Outlook (optional OAuth)
- **Vault location**: Change where documents are stored
- **About / Privacy**: "Zero data leaves this device" with technical details

---

## Key Workflows

### Chat with Document (One-Off)
1. User types question or drags PDF into chat
2. PDF parsed → chunked → embedded (LlamaIndex.TS)
3. Query embedded → nearest chunks retrieved from LanceDB
4. Chunks + query sent to Ollama → streaming response
5. Response shows with citation ("From: filename, page N")

### Document Vault (Persistent Knowledge)
1. User drops file into Vault screen
2. File copied to `~/Library/Application Support/Arc/vault/originals/`
3. Background: parsed → chunked → embedded → stored in LanceDB
4. All future chats automatically search vault first

### Meeting Recording
1. User clicks "Start Recording" (or app auto-starts if calendar event detected)
2. macOS ScreenCaptureKit + AVFoundation capture system audio + mic
3. Audio chunks piped to Whisper.cpp in real-time
4. On stop: full transcript assembled → sent to Ollama for summarization
5. Summary + action items + transcript saved as JSON in `meetings/`

### First Run / Onboarding
1. App opens → detects Apple Silicon chip + RAM
2. Selects best model (M1/8GB → Qwen2.5 7B Q4; M3 Pro/36GB → Llama 3.1 8B Q8)
3. Downloads model via Ollama (progress bar, friendly language)
4. Short 3-step tour: "Here's your chat", "Here's your vault", "Here's meetings"
5. App ready — no cloud accounts required

---

## Technology Decisions

| Concern | Choice | Reason |
|---|---|---|
| Shell | Electron 32+ | Documentation, community, Mac packaging |
| UI | React 18 + Tailwind | Fast to build, easy to maintain |
| Model serving | Ollama | Dead simple embedding, local-only |
| Default model | Qwen2.5 7B (auto) | Good doc comprehension, M-series perf |
| Vector DB | LanceDB | Embedded, no server, fast |
| RAG pipeline | LlamaIndex.TS | Handles chunking + embedding OOTB |
| Transcription | Whisper.cpp | Fast, accurate, local, M-series optimized |
| Audio capture | ScreenCaptureKit + AVFoundation (Swift helper) | Only way to get system audio on macOS |
| Calendar | Google Calendar + Outlook OAuth | Optional — app works without it |
| Doc parsing | pdf-parse + mammoth | PDF + DOCX coverage |

---

## Privacy Guarantee

- Ollama runs 100% locally — no API keys, no outbound calls
- LanceDB is an embedded file database — no server, no network
- Whisper.cpp runs locally — no cloud transcription
- Calendar OAuth tokens stored in macOS Keychain only
- Persistent UI label: "Your data never leaves this Mac"

---

## Phase Decomposition (5 independent plans)

| Phase | Subsystem | Produces |
|---|---|---|
| 1 | Electron shell + Ollama + basic chat UI | Working chat with local LLM |
| 2 | Document intelligence (RAG sidecar + vault) | Document Q&A with citations |
| 3 | Meeting transcription (Whisper + audio) | Local meeting notes |
| 4 | Model management + first-run experience | Polished onboarding |
| 5 | Home screen + calendar + packaging | Shippable app |

Each phase builds on the previous but is independently testable.

---

## Design Language

Follow getdesign.md/claude/design-md system:
- Clean, minimal — lots of whitespace
- Inter font, neutral gray palette with one accent color
- Large tap targets (accessibility for older users)
- No jargon — "Your AI" not "LLM", "Your documents" not "Vector store"
- Status always visible: model loading, recording, indexing — never silently broken
