# IndexedDB Storage

> **Category:** Browser Native Database  
> **W3C Standard:** [IndexedDB API](https://www.w3.org/TR/IndexedDatabase-2/)

---

## Purpose

**IndexedDB** is a local database built into the browser. DocLens uses it to store documents, metadata, cached AI results, and downloaded neural voice models.

---

## Database Schemas

### 1. Documents Database (`doclens-store`)

- `document_blobs`: Stores raw PDF file binary data as Blob assets.
- `document_metadata`: Stores metadata details (filename, page count, file size, extraction status).
- `document_thumbnails`: Stores generated first-page thumbnails as base64 images.
- `document_extractions`: Stores extracted text blocks, coordinate arrays, and garbage metrics per page.
- `document_ai`: Stores cached AI results (translations, summaries, explanations) mapped to settings hashes.

### 2. Neural Voices Database (`piper-voices`)

- `voice_models`: Caches downloaded Piper voice ONNX files to enable offline TTS.

---

## Diagnostics & Management

- **Storage Statistics:** Uses `navigator.storage.estimate()` to show total storage usage on the [[General Settings Page]].
- **Cache Clearing:** The settings page provides a clear cache option to drop the `document_ai` table, allowing users to free up space.

---

## Relationships

- **Feature powered:** [[Document Management]], [[Memory Diagnostics]], [[Piper Neural TTS]].
- **Team Owner:** Jointly managed by all squads.

---

_Part of [[MOC — APIs]]_
