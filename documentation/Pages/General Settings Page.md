# General Settings Page

> **Route:** `/settings`  
> **Source File:** `settings.tsx`  
> **Layout:** [[SidebarLayout]]  
> **SEO Title:** `DocLens — General Settings`

---

## Purpose

The **General Settings Page** configures global variables, manages IndexedDB storage quotas, hosts system connection checks, and monitors client runtime memory statistics.

---

## Layout Structure

Uses a `max-w-7xl` layout divided into three sections: configuration, diagnostics, and model browsing.

```
┌─── Row 1 ─────────────────────────┐
│ 🌐 Output Language │ 💾 Storage & │
│                    │  Memory Diag │
├─── Row 2 ─────────────────────────┤
│ ⚡ AI Pipeline Defaults            │
├─── Row 3 ─────────────────────────┤
│ 🔑 API Mgmt        │ 🧠 Model     │
│                    │   Selection  │
└────────────────────┴──────────────┘
```

---

## UI Components & Interactive Elements

1. **Output Language Card:**
   - Quick preset chips for regional and international languages (हिंदी, বাংলা, English, Spanish, etc.) plus a search bar for custom language parameters.
2. **Storage & Memory Diagnostics Card:**
   - Renders progress bars detailing [[IndexedDB Storage]] capacity.
   - Hosts the **Memory Diagnostics Widget** tracking live JS Heap, Canvas Buffers, Image allocations, and LocalStorage footprint.
   - **Clear AI Cache Button:** Drops all cached translations, leaving document models clean.
3. **AI Pipeline Defaults:**
   - Configures default parameters: Mode (Translate, Explain, Summarize, Custom), Tone Style (Standard, Academic, Simplified), LLM Temperature (Precise to Creative), Memory toggle, and Sequential execution.
4. **API Management:**
   - Displays connectivity status and handles connection verification.
5. **Model Selection:**
   - Displays compatible models fetched from the server. Filterable by tabs: `free`, `popular`, and `all`.
   - Component details: [[AI Translation]].

---

## Diagnostics Detail

The **Memory Diagnostics Widget** refreshes every 3 seconds, visualizing memory allocations to identify memory leaks. It highlights:
- **JS Heap:** Dynamic JavaScript memory footprint.
- **Canvas Buffers:** Raw pixel memory allocated to active PDF canvases.
- **Data URL Images:** Decoded base64 thumbnail images in memory.

---

## Relationships

- **Workflow:** Sets the configuration variables used by the [[PDF to Translation Workflow]].
- **Team Ownership:** Core layout by [[Squad B — Translation]]; Diagnostics card co-owned by [[Shared Services]] DevOps and QA leads.

---

*Part of [[MOC — Pages]]*
