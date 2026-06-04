# Text-to-Speech Feature

> Orchestrates voice synthesis and text highlighting during audio playback.

---

## Capabilities

- Splits text into sentence chunks to handle browser synthesis limitations.
- Automatically highlights the active sentence and visually underlines buffered sentences.
- Supports seeking: clicking any sentence jumps audio playback to that position.
- Saves voice preferences per-language.

---

## Dual-Engine Orchestration

The system routes requests based on the selected engine preference:
1. **Neural (Piper):** WebAssembly-based local TTS engine. Used for high-quality, offline speech synthesis.
2. **Browser (Web Speech API):** Standard browser synthesis engine. Used as a fallback or for unsupported languages.

---

## UI Controls

- **Playback Bar:** Play (▶), Pause (❚❚), Stop (■), Forward (›), and Rewind (‹) buttons located in the workstation header.
- **Settings Sliders:** Voice Settings speed (0.25x to 4x) and pitch controls.

---

## Relationships

- **Engine detail:** [[Piper Neural TTS]], [[Web Speech API]].
- **Team Owner:** [[Squad C — TTS]].
- **Workflow:** [[Translation to TTS Workflow]].

---

*Part of [[MOC — Features]]*
