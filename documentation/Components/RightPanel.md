# RightPanel Component

> **File:** `src/components/RightPanel.tsx`  
> **Type:** Workspace Tab Container

---

## Purpose

Serves as the tabbed container wrapper in the workspace, housing the Page Workstation controller and the raw extracted original text reference tab.

---

## UI Structure & Elements

1. **Tab Switcher Header:**
   - Alternates between the "AI Assistant" and "Original Text" tabs. Displays a green underline indicator beneath the active selection.
   - Shows a status spinner when the document is being analyzed.
   - **Export Dropdown:** Provides buttons to export document data as Markdown or JSON.
2. **Content Area:**
   - Renders the [[PageWorkstation]] component inside the AI Assistant tab.
   - Displays the raw extracted page text inside the Original Text tab. Clicking the card triggers a scroll event in the [[PdfViewer]].

---

## Relationships

- **Used In:** [[Workspace Page]].
- **Feature powered:** [[Export System]].

---

_Part of [[MOC — Components]]_
