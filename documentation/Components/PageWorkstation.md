# PageWorkstation Component

> **File:** `src/components/PageWorkstation.tsx`  
> **Type:** AI Translation Control Panel

---

## Purpose

The workstation component acts as the main controller for the translation workspace. It coordinates the page-translation state machinery, background auto-translation processes, request payloads, user settings, and speech synthesis playback controls.

---

## UI Sections & Elements

1. **Toolbar:**
   - Displays overall progress (e.g., "N of M translated") and houses the [[Auto-Translate]] toggle.
2. **Page Workstation Card:**
   - **Header:** Shows page indicators, progress status dots, custom badges, TTS buttons (Play, Pause, Stop, Forward, Rewind), and the custom overrides panel toggle (⚙).
   - **Body:** Shows the streaming translation output. Clickable sentence chunks highlight in sync with the audio player during TTS playback.
3. **Collapsible Override Panel (⚙):**
   - Hosts selectors to configure model, mode, style, and temperature settings for the active page.
   - Provides reset buttons and a JSON payload editor.
4. **Floating Background Batch Progress Pill:**
   - Renders in the bottom-right corner when auto-translate processes are running in the background.
5. **Loading States:**
   - Uses [[LoadingLogo]] as a branded placeholder during page rendering and processing.

---

## State & Engine Integration

- **SSE Streaming:** Uses real-time Server-Sent Events via `streamCompletion()` from [[OpenRouter API]] to pipe translation tokens to the UI progressively, updating `streamBufs` state every 150ms.
- **Audio Playback Synchronization:** Uses the TTS manager to coordinate sentence highlights with speech.
- **`localStorage` State Persistence:** Persists auto-translate preferences per document.
- **Error Handling:** Granular error handling with descriptive toast messages for extraction failures, storage quota exhaustion, and API errors.

---

## Relationships

- **Used In:** [[Workspace Page]].
- **Feature powered:** [[AI Translation]], [[Auto-Translate]], [[Per-Page Overrides]], [[Text-to-Speech]].
- **Components:** [[LoadingLogo]].

---

_Part of [[MOC — Components]]_
