# Tech Stack

> Frameworks, libraries, and architectural patterns powering DocLens AI.

---

## Core Framework

| Layer            | Technology         | Purpose                                       |
| ---------------- | ------------------ | --------------------------------------------- |
| **UI Framework** | React 18+          | Component rendering                           |
| **Routing**      | TanStack Router    | File-based routing with URL-synced state      |
| **Styling**      | Tailwind CSS       | Utility-first CSS with custom theme tokens    |
| **Bundler**      | Vite               | Dev server and production builds              |
| **Deployment**   | Cloudflare Workers | Edge-deployed server functions (via Wrangler) |

---

## Key Dependencies

| Library                       | Purpose                                          | Used By                                     |
| ----------------------------- | ------------------------------------------------ | ------------------------------------------- |
| [[PDF.js]] (`pdfjs-dist`)     | PDF rendering, text extraction, text layer       | [[PdfViewer]], [[PDF Extraction Pipeline]]  |
| [[OpenRouter API]]            | LLM model routing — GPT-4, Claude, Gemini, Llama | [[AI Translation]], [[PageWorkstation]]     |
| [[Piper WASM Engine]]         | Offline neural TTS via WebAssembly               | [[Piper Neural TTS]], [[Text-to-Speech]]    |
| [[Web Speech API]]            | Browser-native speech synthesis fallback         | [[Text-to-Speech]]                          |
| [[SQLite WASM + OPFS]]        | High-performance document and AI result storage  | [[Document Management]], all pages          |
| [[IndexedDB Storage]]         | Fallback storage backend                         | [[Document Management]] (fallback)          |
| `@sqlite.org/sqlite-wasm`     | SQLite compiled to WebAssembly for OPFS access   | `storage.worker.ts`                         |
| `comlink`                     | Web Worker RPC bridge for SQLite backend         | `storage.ts` ↔ `storage.worker.ts`          |
| Sonner                        | Toast notification system                        | All pages                                   |
| shadcn/ui                     | Dialog, AlertDialog UI primitives                | [[ApiKeyModal]], [[ExplainSetupDialog]]      |

---

## Data Storage Architecture

| Store                      | Technology             | Contents                                                       |
| -------------------------- | ---------------------- | -------------------------------------------------------------- |
| **Documents + AI results** | SQLite WASM (OPFS)     | PDF binaries, extracted text, AI translations, settings hashes |
| **Documents (fallback)**   | IndexedDB              | Same as above — automatic fallback when OPFS is unavailable    |
| **User preferences**       | localStorage           | Language, model, mode, temperature, memory, voice selections   |
| **Session state**          | sessionStorage         | Cold-launch flag                                               |
| **Neural voice models**    | OPFS / IndexedDB       | Piper ONNX model files (20–60 MB each) via voice cache layer  |
| **URL state**              | Query params           | Active page number (`?page=N`)                                 |

---

## Architecture Pattern

```
Browser (Client)
├── React SPA (Vite)
│   ├── TanStack Router (file-based routes)
│   ├── PDF.js (canvas + text layer rendering)
│   ├── Piper WASM (neural TTS engine)
│   ├── SQLite WASM + OPFS (primary storage via Web Worker)
│   │   └── Comlink RPC bridge → storage.worker.ts
│   ├── IndexedDB (fallback storage backend)
│   └── Voice Cache Layer (OPFS primary, IDB fallback)
│
└── Server Functions (Cloudflare Workers)
    ├── OpenRouter API proxy (SSE streaming, API key never exposed to client)
    └── Model list fetching
```

### Cross-Origin Isolation

The application requires **COOP/COEP headers** (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) to enable `SharedArrayBuffer`, which is required by the SQLite WASM + OPFS backend. These headers are configured in both `vite.config.ts` (dev) and `nitro.config.ts` (production).

---

## Related

- [[What is DocLens AI]] — Product context
- [[Design System]] — Visual implementation
- [[MOC — APIs]] — External service integrations
- [[MOC — Pipelines]] — Data flow architecture
- [[MOC — Components]] — UI component inventory

---

_Part of [[MOC — Product]]_
