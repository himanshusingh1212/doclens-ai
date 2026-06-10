# Piper Neural TTS Feature

> WebAssembly-based offline neural speech synthesis system.

---

## Capabilities

- Performs neural speech synthesis locally in the browser using WebAssembly.
- Works offline once voice models are installed.
- Offers a catalog of different voice qualities (medium, high, low) across multiple languages.

---

## Installation & Caching

1. The catalog modal is opened from the [[Voice Settings Page]] or via the [[ExplainSetupDialog|TTS Voice Setup Dialog]].
2. Installing a voice downloads its ONNX model file (~20–60MB) via HTTP.
3. The downloaded model is cached locally in [[IndexedDB Storage]] for subsequent offline use.
4. On playback, the system loads the ONNX runtime inside a Web Worker to keep the main UI thread responsive.

---

## Relationships

- **Feature parent:** [[Text-to-Speech]].
- **Team Owner:** [[Squad C — TTS]].
- **API integration:** [[Piper WASM Engine]].

---

_Part of [[MOC — Features]]_
