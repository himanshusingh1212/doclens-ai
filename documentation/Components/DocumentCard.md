# DocumentCard Component

> **File:** `src/components/DocumentCard.tsx`  
> **Type:** Library Document Dashboard Card

---

## Purpose

Displays document metadata, thumbnails, and action items in the library collection grid.

---

## UI Structure & Elements

1. **Thumbnail Area (`h-40`):**
   - Displays the generated first page image. Shows a fallback card if no thumbnail exists.
   - Triggers a loading spinner when thumbnail assets are being fetched.
   - Displays an "AI PROCESSED" badge in the corner if translations exist.
2. **Metadata Block:**
   - Displays the filename (truncated), file size, page count, and result count badges.
3. **Delete Trigger:**
   - An options icon (⋮) that appears when hovering over the card. Opens the delete confirmation dialog.

---

## State & Props

- **`doc` (DocSummary):** Object containing document metadata (ID, filename, page count, file size, processing flags).
- **`onDelete` (callback):** Triggered when the user confirms document deletion.

---

## Relationships

- **Used In:** [[Library Page]].
- **Feature powered:** [[Document Management]].

---

_Part of [[MOC — Components]]_
