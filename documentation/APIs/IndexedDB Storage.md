# IndexedDB Storage

> **Category:** Browser Native Database  
> **W3C Standard:** [IndexedDB API](https://www.w3.org/TR/IndexedDatabase-2/)  
> **Status:** Fallback backend (since v6 migration to SQLite WASM + OPFS)

---

## Purpose

**IndexedDB** is a local database built into the browser. DocLens previously used it as the sole document storage backend. As of the SQLite WASM + OPFS migration, IndexedDB now serves as the **automatic fallback** when OPFS is unavailable (e.g., browsers lacking `SharedArrayBuffer` support or private/incognito windows).

---

## Database Schemas

### 1. Documents Database (`doclens-store`) — Fallback

- `document_blobs`: Stores raw PDF file binary data as Blob assets.
- `document_metadata`: Stores metadata details (filename, page count, file size, extraction status).
- `document_thumbnails`: Stores generated first-page thumbnails as base64 images.
- `document_extractions`: Stores extracted text blocks, coordinate arrays, and garbage metrics per page.
- `document_ai`: Stores cached AI results (translations, summaries, explanations) mapped to settings hashes.

### 2. Neural Voice Cache (`doclens-voice-cache`)

- `voice-files`: Caches downloaded Piper voice ONNX model files and JSON configs for offline neural TTS. Used as a fallback when OPFS voice cache is unavailable.

---

## Current Role in the Architecture

The storage layer (`src/lib/storage.ts`) implements a **dual-backend dispatcher** pattern:

1. **Primary:** `SqliteOpfsBackend` — SQLite WASM running in a Web Worker, accessed via Comlink RPC. Uses OPFS for persistent file storage.
2. **Fallback:** `IdbBackend` — The original IndexedDB implementation. Activated automatically if OPFS/SharedArrayBuffer is not available.

Both backends implement the same `StorageBackend` interface, making the switch transparent to the rest of the application.

---

## Relationships

- **Primary successor:** [[SQLite WASM + OPFS]].
- **Feature powered:** [[Document Management]], [[Piper Neural TTS]] (voice cache fallback).
- **Team Owner:** Jointly managed by all squads.

---

_Part of [[MOC — APIs]]_
