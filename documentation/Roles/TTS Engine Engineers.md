# TTS Engine Engineers

> **Squad:** [[Squad C — TTS]]  
> **Operational Depth:** Depth 1 (Primary voice task)

---

## Purpose

**TTS Engine Engineers** build and optimize local WASM and browser-native voice generation tools.

---

## Responsibilities

- **Local WASM Integration:** Integrates the [[Piper WASM Engine]] ONNX voice runtime.
- **Worker Management:** Runs WASM pipelines in Web Workers to prevent UI blocking.
- **Browser TTS Config:** Configures fallbacks using the browser-native [[Web Speech API]].
- **Audio Control Systems:** Handles playback controls, sentence splitting, and text-highlighting sync.

---

## Related

- [[Squad C — TTS]] — Parent squad.
- [[TTS Pipeline]] — Pipeline stage.
- [[Piper WASM Engine]] — Core technology.

---

*Part of [[MOC — Roles]]*
