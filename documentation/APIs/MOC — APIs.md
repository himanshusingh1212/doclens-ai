# 🔌 MOC — APIs

> External APIs, libraries, and browser interfaces integrated into DocLens AI.

---

## API Registry

| API / Library             | Category           | Description                                                               | Used By                 |
| ------------------------- | ------------------ | ------------------------------------------------------------------------- | ----------------------- |
| [[OpenRouter API]]        | External Cloud     | Aggregated LLM provider for translation, summary, and explanation prompts | [[AI Translation]]      |
| [[Piper WASM Engine]]     | WebAssembly        | Local client-side neural speech synthesis (TTS) generator                 | [[Piper Neural TTS]]    |
| [[Web Speech API]]        | Browser Native     | Standard native speech synthesis engine used as a fallback                | [[Text-to-Speech]]      |
| [[SQLite WASM + OPFS]]    | Browser Native     | Primary high-performance storage backend via Web Worker                   | [[Document Management]] |
| [[IndexedDB Storage]]     | Browser Native     | Fallback storage for documents when OPFS is unavailable                   | [[Document Management]] |
| [[Voice Cache Layer]]     | Browser Native     | Dual-storage (OPFS/IDB) cache for Piper neural voice models              | [[Piper Neural TTS]]    |
| [[PDF.js]]                | Core Library       | PDF text parsing, coordinates positioning, and rendering canvas generator | [[PDF Viewer]]          |

---

## Technical Architecture

```mermaid
graph TD
    Features[⚙️ Features] --> APIs[🔌 APIs & Libraries]
    APIs --> Local[💻 Local / Browser-Native]
    APIs --> Cloud[☁️ External Cloud APIs]

    Local --> SQLite[SQLite WASM + OPFS]
    Local --> IDB[IndexedDB Storage]
    Local --> VoiceCache[Voice Cache Layer]
    Local --> WS[Web Speech API]
    Local --> Piper[Piper WASM Engine]
    Local --> PDFJS[PDF.js]

    Cloud --> OR[OpenRouter API]

    SQLite -.->|fallback| IDB
    VoiceCache -.->|uses| SQLite
    VoiceCache -.->|fallback| IDB
```

---

_Part of [[00 — MOC — Project]]_
