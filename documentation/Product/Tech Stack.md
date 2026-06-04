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

| Library                   | Purpose                                          | Used By                                     |
| ------------------------- | ------------------------------------------------ | ------------------------------------------- |
| [[PDF.js]] (`pdfjs-dist`) | PDF rendering, text extraction, text layer       | [[PdfViewer]], [[PDF Extraction Pipeline]]  |
| [[OpenRouter API]]        | LLM model routing — GPT-4, Claude, Gemini, Llama | [[AI Translation]], [[PageWorkstation]]     |
| [[Piper WASM Engine]]     | Offline neural TTS via WebAssembly               | [[Piper Neural TTS]], [[Text-to-Speech]]    |
| [[Web Speech API]]        | Browser-native speech synthesis fallback         | [[Text-to-Speech]], [[Voice Settings Page]] |
| [[IndexedDB Storage]]     | Document and AI result persistence               | [[Document Management]], all pages          |
| Sonner                    | Toast notification system                        | All pages                                   |
| shadcn/ui                 | Dialog, AlertDialog UI primitives                | [[ApiKeyModal]], [[ExplainSetupDialog]]     |

---

## Data Storage Architecture

| Store                      | Technology     | Contents                                                       |
| -------------------------- | -------------- | -------------------------------------------------------------- |
| **Documents + AI results** | IndexedDB      | PDF binaries, extracted text, AI translations, settings hashes |
| **User preferences**       | localStorage   | Language, model, mode, temperature, memory, voice selections   |
| **Session state**          | sessionStorage | Cold-launch flag                                               |
| **Neural voice models**    | IndexedDB      | Piper ONNX model files (20–60 MB each)                         |
| **URL state**              | Query params   | Active page number (`?page=N`)                                 |

---

## Architecture Pattern

```
Browser (Client)
├── React SPA (Vite)
│   ├── TanStack Router (file-based routes)
│   ├── PDF.js (canvas + text layer rendering)
│   ├── Piper WASM (neural TTS engine)
│   └── IndexedDB (document + model storage)
│
└── Server Functions (Cloudflare Workers)
    ├── OpenRouter API proxy (API key never exposed to client)
    └── Model list fetching
```

---

## Related

- [[What is DocLens AI]] — Product context
- [[Design System]] — Visual implementation
- [[MOC — APIs]] — External service integrations
- [[MOC — Pipelines]] — Data flow architecture
- [[MOC — Components]] — UI component inventory

---

*Part of [[MOC — Product]]*
