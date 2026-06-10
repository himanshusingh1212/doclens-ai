# Piper WASM Engine

> **Category:** WebAssembly Engine  
> **Source Repository:** [rhasspy/piper](https://github.com/rhasspy/piper)

---

## Purpose

**Piper** is a local neural text-to-speech system. Running inside WebAssembly, it enables high-quality, offline speech synthesis directly within the browser, eliminating the need to upload text to external TTS services.

---

## Integration Details

- **WASM Run Environment:** The ONNX engine is initialized inside a Web Worker. This isolates heavy calculations from the main execution thread, preventing the UI from freezing.
- **IndexedDB Caching:** ONNX models (~20–60MB) are downloaded on-demand and cached in browser storage. Subsequent playback loads the model directly from local storage.
- **Data Conversion:** The Web Assembly worker outputs raw audio data, which is converted to Blob URLs for playback using standard browser audio elements.

---

## Key Configurations

- **Voice Profiles:** Supports multiple language models with varying qualities (medium, high, low).
- **Audio Tuning:** Adjusts speed settings via the WASM runtime before speech generation.

---

## Relationships

- **Page integration:** [[Voice Settings Page]].
- **Feature powered:** [[Piper Neural TTS]], [[Text-to-Speech]].
- **Team Owner:** [[Squad C — TTS]].

---

_Part of [[MOC — APIs]]_
