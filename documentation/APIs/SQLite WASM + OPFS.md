# SQLite WASM + OPFS

> **Category:** Browser-Native High-Performance Storage  
> **Library:** [`@sqlite.org/sqlite-wasm`](https://sqlite.org/wasm/)  
> **Worker Bridge:** [`comlink`](https://github.com/GoogleChromeLabs/comlink)

---

## Purpose

**SQLite WASM + OPFS** is the primary storage backend for DocLens AI. It replaces the original IndexedDB-only approach with a full relational database running inside a Web Worker, providing faster queries, ACID transactions, and a more robust storage layer for documents, AI results, and metadata.

---

## Architecture

```
Main Thread (storage.ts)         Web Worker (storage.worker.ts)
┌────────────────────┐           ┌──────────────────────────┐
│  SqliteOpfsBackend │──Comlink──│  SQLite WASM (OPFS VFS)  │
│  implements        │   RPC     │  - Documents table       │
│  StorageBackend    │◄─────────►│  - PageData table        │
│                    │           │  - AI Results table      │
│  Falls back to     │           │  - Thumbnails table      │
│  IdbBackend if     │           │  - Settings KV store     │
│  OPFS unavailable  │           └──────────────────────────┘
└────────────────────┘
```

- **Web Worker Isolation:** The SQLite engine runs entirely in a dedicated Web Worker (`storage.worker.ts`) to prevent blocking the main UI thread during heavy I/O operations.
- **Comlink RPC:** The `comlink` library provides a clean async API surface so the main thread calls worker methods as if they were local async functions.
- **OPFS VFS:** Uses the Origin Private File System via `sqlite3.oo1.OpfsDb` for persistent, high-performance file-backed storage.

---

## Prerequisites

SQLite WASM + OPFS requires **cross-origin isolation** headers to enable `SharedArrayBuffer`:

| Header                         | Value          |
| ------------------------------ | -------------- |
| `Cross-Origin-Opener-Policy`   | `same-origin`  |
| `Cross-Origin-Embedder-Policy` | `require-corp` |

These are configured in `vite.config.ts` (dev server) and `nitro.config.ts` (production/Cloudflare Workers).

---

## Type Definitions

Since `@sqlite.org/sqlite-wasm` does not ship TypeScript declarations, a custom type definition file is maintained at `src/types/sqlite-wasm.d.ts`.

---

## Fallback Behavior

If OPFS or `SharedArrayBuffer` is not available (e.g., in browsers without cross-origin isolation, or in private/incognito windows), the system automatically falls back to the [[IndexedDB Storage]] backend. The fallback is transparent — both backends implement the same `StorageBackend` interface.

---

## Source Files

| File                     | Role                                              |
| ------------------------ | ------------------------------------------------- |
| `src/lib/storage.ts`     | Dual-backend dispatcher and `StorageBackend` API  |
| `src/lib/storage.worker.ts` | Web Worker hosting the SQLite WASM engine       |
| `src/types/sqlite-wasm.d.ts` | TypeScript declarations for the WASM module    |

---

## Relationships

- **Fallback:** [[IndexedDB Storage]].
- **Feature powered:** [[Document Management]], all pages.
- **Team Owner:** Jointly managed by all squads.

---

_Part of [[MOC — APIs]]_
