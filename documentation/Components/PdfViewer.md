# PdfViewer Component

> **File:** `src/components/PdfViewer.tsx`  
> **Type:** Scrollable Document Renderer

---

## Purpose

Handles parsing, visual canvas generation, transparent text overlay layering, page synchronization, and tracks selection highlights to trigger contextual action menus.

---

## UI Structure & Elements

1. **Scrollable Page Canvas Grid:**
   - Stack of canvases rendered dynamically at width scales targeting 800px. Active pages display a green accent border on the left.
   - Page number badges float relative to the bottom center of each page card.
2. **Transparent Selection Overlay Layer:**
   - Positioned over page canvases. Contains transparent text elements matching PDF text layout nodes to support cursor highlighting.
3. **Floating Contextual Toolbar:**
   - Positioned dynamically above selection coordinates. Offers Copy, Translate, and Speak actions. See [[Text Selection Toolbar]].

---

## State & Performance Management

- **Lazy Rendering Intersection Observer:** Listens to page visibility. Keeps at most 5 canvas maps active in memory. Evicts older canvases as new pages are scrolled into view.
- **`activePage` Synchronization:** Updates query parameters in the URL to sync the active page across panels.
- **`doclens:scroll-to-pdf` listener:** Listens to custom scroll events sent from the right panel.

---

## Relationships

- **Used In:** [[Workspace Page]].
- **Feature powered:** [[PDF Viewer]], [[Text Selection Toolbar]].
- **APIs:** [[PDF.js]].

---

_Part of [[MOC — Components]]_
