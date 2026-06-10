# ApiKeyModal Component

> **File:** `src/components/ApiKeyModal.tsx`  
> **Type:** Setup Check Dialog

---

## Purpose

Provides a connection check modal to verify API keys. It runs connection checks and displays status information to the user.

---

## UI Structure

1. **Modal Header:**
   - Displays verification labels and help links for generating OpenRouter API keys.
2. **Status Block:**
   - Displays the connection status (`connected` / `env key missing` / `server key invalid`) with matching indicator colors.
3. **Control Row:**
   - **Check Server Key Button:** Dispatches checking calls to validation workers.
   - **Close Button:** Dismisses the modal.

---

## Event Listeners

- Listens for global `doclens:open-api-key-modal` events on the window, enabling the modal to be opened from any component in the application.

---

## Relationships

- **Rendered In:** Root layout (`__root.tsx`).
- **Feature powered:** [[API Key Management]].
- **APIs:** [[OpenRouter API]].

---

_Part of [[MOC — Components]]_
