# Auto-Translate Feature

> Background pre-processing system enabling seamless document reading.

---

## Capabilities

- Pre-translates upcoming pages in the background as the user reads.
- Automatically skips pages that have already been translated.
- Visualizes background progress through a floating progress pill.

---

## Workflow Details

1. When the user navigates to page $N$, the system checks if the next 3 pages ($N+1$, $N+2$, $N+3$) have cached results.
2. If any page is missing a translation, the system queues background translation tasks.
3. If the user jumps to a different section, any active background translation tasks are cancelled to prioritize the new reading window.
4. The auto-translate setting is saved per-document in `localStorage`.

---

## UI Components

- **Toggle Switch:** Located in the workstation toolbar.
- **Progress Pill:** Floating pill in the bottom-right corner showing current progress (e.g., "Pre-translating 3/5"). Includes a cancel button to stop background tasks.

---

## Relationships

- **Component:** [[PageWorkstation]].
- **Team Owner:** [[Squad B — Translation]].
- **Workflow:** [[PDF to Translation Workflow]].

---

_Part of [[MOC — Features]]_
