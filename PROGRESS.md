# Arc — Build Progress

## What Arc Is

A Mac-only Electron desktop app giving regulated-industry professionals (law, finance, healthcare) a private, local AI assistant. No data leaves the device.

Two core features:
1. **Chat + Document Q&A** — drag PDFs into chat or maintain a persistent vault; local LLM answers with citations
2. **Meeting transcription** — records mic + system audio, transcribes locally with Whisper.cpp, summarizes with local LLM

## Key Decisions (locked in)

| Decision | Choice |
|---|---|
| Platform | Mac only |
| Shell | Electron 32 |
| Model serving | Ollama (bundled binary) |
| Default model | Qwen2.5 7B (auto-selected by device capability) |
| Vector DB | LanceDB (embedded) |
| RAG | LlamaIndex.TS sidecar |
| Transcription | Whisper.cpp subprocess |
| Audio | ScreenCaptureKit + AVFoundation (mic + system audio) |
| Calendar | Google/Outlook OAuth — optional |
| Compliance | On-device only; prominent UI badge |

## Spec

Full design spec: `docs/superpowers/specs/2026-04-24-arc-design.md`

## Phase Plan

| Phase | Plan File | Status |
|---|---|---|
| 1 — Electron shell + Ollama + Chat UI | `docs/superpowers/plans/2026-04-24-phase1-electron-shell-chat.md` | **READY TO BUILD** |
| 2 — Document Intelligence (RAG + Vault) | Not yet written | Pending Phase 1 |
| 3 — Meeting Transcription (Whisper + Audio) | Not yet written | Pending Phase 2 |
| 4 — Model Management + First Run | Not yet written | Pending Phase 3 |
| 5 — Home Screen + Calendar + Packaging | Not yet written | Pending Phase 4 |

## How to Continue in a New Session

1. Read this file first
2. Read `docs/superpowers/specs/2026-04-24-arc-design.md` for full context
3. Check which phase is next (see table above)
4. Read the plan file for that phase
5. Use `superpowers:subagent-driven-development` to execute tasks

## Where Things Live

```
~/Desktop/arc/
├── PROGRESS.md                    ← you are here
├── docs/superpowers/
│   ├── specs/2026-04-24-arc-design.md
│   └── plans/2026-04-24-phase1-electron-shell-chat.md
├── src/
│   ├── main/         # Electron main process
│   ├── preload/      # IPC bridge
│   └── renderer/     # React UI
└── resources/
    └── ollama/       # Bundled Ollama binary
```

## Notes for Next Session

- Plans for Phases 2–5 need to be written before each phase starts (don't pre-write them — write them just-in-time with fresh context)
- The Ollama binary needs to be downloaded manually into `resources/ollama/ollama` during dev
- App data stored in `~/Library/Application Support/Arc/`
- No cloud services, no API keys needed
