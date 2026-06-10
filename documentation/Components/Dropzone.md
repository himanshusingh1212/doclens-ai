# Dropzone Component

> **File:** `src/components/Dropzone.tsx`  
> **Type:** Drag and Drop File Input

---

## Purpose

Provides a drag-and-drop file ingestion area. It validates file uploads, checks format specifications, and triggers downstream document processing.

---

## UI Elements & States

1. **Interactive dashed box (`h-56`):**
   - Renders background styling patterns and an upload icon. Hovering expands the icon and highlights borders.
   - Dragging files over the card changes border colors and displays a glowing background shadow.
2. **Text indicators:**
   - Main instruction: "Click or drag PDF documents here".
   - Helper parameters: "PDF only · max 50.0 MB".
   - Privacy reassurance: "processed entirely in your browser · nothing uploaded".

---

## Properties & Callbacks

- **`onNewDocument` (callback):** Callback triggered when a PDF file passes validation checks. Receives the validated File object.

---

## Relationships

- **Used In:** [[Library Page]].
- **Feature powered:** [[Document Management]].

---

_Part of [[MOC — Components]]_
