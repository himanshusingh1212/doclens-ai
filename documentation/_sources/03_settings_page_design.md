# General Settings Page — UI/UX Design Document

> **Route:** `/settings`  
> **File:** [settings.tsx](file:///home/sanskar/Downloads/doclens-ai/src/routes/settings.tsx)  
> **Layout:** [SidebarLayout](file:///home/sanskar/Downloads/doclens-ai/src/components/SidebarLayout.tsx)  
> **SEO Title:** `DocLens — General Settings`

---

## Purpose

The General Settings page is the **centralized configuration hub** for DocLens AI's AI pipeline, storage management, and API connectivity. It controls global defaults that affect all document processing: output language, AI model selection, translation mode, tone style, temperature, and memory management.

This page serves three distinct user personas:
1. **First-time users** — set up API connectivity and choose language/model
2. **Regular users** — adjust translation preferences as needs change
3. **Power users/developers** — monitor memory diagnostics, manage storage, and fine-tune model parameters

---

## Layout Overview

```
┌──────────┬───────────────────────────────────────────┐
│  Sidebar │  Top Bar: "General Settings" │ [System    │
│  (w-64)  │                              │  Online]   │
│          ├───────────────────────────────────────────┤
│  ◐ Logo  │  Scrollable Content (max-w-7xl, p-8)     │
│  📁 Lib  │                                           │
│  ⚙ Gen ← │  Header: "General Settings"               │
│  🎙 Voice│  "Configure your AI intelligence core..." │
│          │                                           │
│          │  ┌─── Row 1 (md:grid-cols-2) ───────────┐ │
│          │  │ 🌐 Output Language  │ 💾 Storage &   │ │
│          │  │   [Search input]    │   Memory Diag   │ │
│          │  │   [Lang chips]      │   [IDB bar]     │ │
│          │  │                     │   [Memory bars]  │ │
│          │  │                     │   [Clear Cache]  │ │
│          │  └─────────────────────┴─────────────────┘ │
│          │                                           │
│          │  ┌─── Row 2 (full width) ───────────────┐ │
│          │  │ ⚡ AI Pipeline Defaults               │ │
│          │  │   [Mode] [Tone Style] [Temperature]   │ │
│          │  │   [☐ Memory] [☐ Sequential Execution] │ │
│          │  └───────────────────────────────────────┘ │
│          │                                           │
│          │  ┌─── Row 3 (md:grid-cols-12) ──────────┐ │
│          │  │ 🔑 API Mgmt    │ 🧠 Model Selection  │ │
│          │  │ (col-span-5)   │ (col-span-7)         │ │
│          │  │ [Status]       │ [Search] [Free|Pop|All]│
│          │  │ [Verify btn]   │ [Model list...]       │ │
│          │  └────────────────┴──────────────────────┘ │
└──────────┴───────────────────────────────────────────┘
```

The page uses a three-row layout within `max-w-7xl` centered content. All sections use `.glass-panel` styling for visual consistency. Extra bottom padding (`pb-28`) prevents the last section from being obscured by the viewport edge.

---

## UI Components

---

### 1. Page Header

* **Description:** "General Settings" heading in `text-4xl font-bold tracking-tight` with subtitle "Configure your AI intelligence core and global defaults."
* **Top Bar Right Badge:** A `rounded-full` pill reading "System Online" in primary green (`border-primary/20 bg-primary/10 text-primary`).
* **UX Rationale:** The "System Online" badge provides immediate reassurance that the backend is operational. The heading matches the Library page's typographic weight for consistency.

---

### 2. Output Language Card

* **Description:** Glass panel containing a search input and language preset chips.
* **Icon:** 🌐 (globe)

#### 2.1 Language Search Input

* **Description:** Full-width text input with a 🔍 search icon positioned absolutely at the left.
* **Functionality:** Serves dual purpose:
  - **Search:** Filters the preset language chips (not implemented — all chips remain visible)
  - **Custom language:** Typing a language name and pressing Enter sets a custom output language
* **UX Rationale:** Supports the ~90+ languages that OpenRouter models handle, not just the predefined chips.
* **State Changes:** `focus:border-primary` border highlight on focus.

#### 2.2 Language Preset Chips

* **Description:** Row of `rounded-full` pill buttons for 9 common languages:
  - हिंदी, বাংলা, తెలుగు, മലయാళം, English, Spanish, Mandarin, French, German
* **Functionality:** Clicking a chip immediately sets the output language and persists it to `localStorage`.
* **Active State:** `bg-primary text-primary-foreground` (green fill)
* **Inactive State:** `bg-surface-2 text-muted-foreground`
* **Hover:** `hover:bg-border hover:text-foreground`
* **UX Rationale:** The top 4 languages are Indian languages written in their native scripts — reflecting the primary user base. Including the native script (not romanized names) shows respect for the languages and helps users scan quickly.
* **Placement:** After the search input — chips provide one-click shortcuts while search handles the long tail.

---

### 3. Storage & Memory Diagnostics Card

* **Description:** Glass panel with IndexedDB usage bar and live runtime memory monitoring.
* **Icon:** 💾 (yellow)

#### 3.1 IndexedDB Usage Bar

* **Description:** A horizontal progress bar showing storage usage (e.g., "12.3 MB / 2048 MB").
* **Functionality:** Calls `navigator.storage.estimate()` to get real-time IDB usage and quota.
* **Visual:** Yellow (`bg-yellow-500`) bar on a dark track, capped at 100%.
* **Labels:** "IndexedDB Usage" on the left, "N MB / N MB" on the right.
* **UX Rationale:** Users storing many PDFs with AI results need visibility into storage consumption to prevent quota-exceeded errors.

#### 3.2 Runtime Memory Diagnostics (MemoryDiagnostics Component)

A sophisticated live monitoring widget that refreshes every 3 seconds.

**Stacked Horizontal Bar:**
Color-coded segments showing relative memory contribution:

| Category | Color | Data Source |
|----------|-------|-------------|
| JS Heap | `#4edea3` (green) | `performance.memory.usedJSHeapSize` |
| Canvas Buffers | `#f59e0b` (amber) | Sum of `width × height × 4` for all `<canvas>` elements |
| Data URL Images | `#818cf8` (indigo) | Byte length of all `data:` `img.src` attributes |
| DOM Overhead | `#38bdf8` (sky blue) | Node count × 256 bytes (estimated) |
| LocalStorage | `#a78bfa` (purple) | Total bytes across all localStorage keys |

**Breakdown Rows:**
Each category gets a row showing:
- Color swatch (2.5px rounded square)
- Category name (bold)
- Detail text (e.g., "23.4 MB / 50.0 MB (limit 2048.0 MB)")
- Byte value (right-aligned, tabular-nums)

**Controls:**

| Button | Function |
|--------|----------|
| **LIVE** badge | Green pill indicating real-time updates |
| **⏸ Pause / ▶ Resume** | Toggles the 3-second auto-refresh interval |
| **↻ Refresh** | Manual snapshot |

**Footer Stats:**
Additional metrics in a compact row: Blob URL count, Stylesheet count, CSS Rule count.

* **UX Rationale:** DocLens processes large PDFs with canvas rendering, WASM TTS, and streaming AI results — all memory-intensive operations. This diagnostics panel gives developers and power users visibility into resource consumption, helping identify memory leaks or excessive usage patterns.
* **Placement:** Alongside output language in row 1 — equally important for system health as language configuration.

#### 3.3 Clear AI Cache Button

* **Description:** A destructive-styled button (🗑️ icon) reading "Clear AI Cache" or "Clearing…" during operation.
* **Functionality:** After a `confirm()` dialog, calls `clearAllAiResults()` to delete all AI translation/explanation results from IndexedDB. Preserves extracted document text.
* **State Changes:** `disabled:opacity-50` while clearing. Refreshes storage stats on completion.
* **UX Rationale:** Users who change language, model, or style may want to regenerate all translations. Clearing the cache enables this without re-uploading documents.
* **Placement:** Bottom-right of the storage card — visually subordinate (no fill, text-only destructive color) to prevent accidental use.

---

### 4. AI Pipeline Defaults Card

* **Description:** Full-width glass panel with a 3-column grid of AI configuration controls.
* **Icon:** ⚡ (accent color)

#### 4.1 Default Mode Selector

* **Description:** Full-width `<select>` dropdown with mode options.
* **Options:** Values from `MODE_INSTRUCTIONS` — typically: Translate, Explain, Summarize, Custom Prompt.
* **Functionality:** Sets the global default mode. Persists to `localStorage`. Immediately effective for new translations.
* **Label:** "DEFAULT MODE" in uppercase, bold, tracked-wide.
* **UX Rationale:** Mode is the highest-level decision — it fundamentally changes what the AI does with each page.

#### 4.2 Tone Style Selector

* **Description:** Full-width `<select>` dropdown with style options from `EXPLANATION_STYLES`.
* **Options:** Standard, Academic, Simplified, and others (each with a label and instruction description).
* **Disabled state:** When mode is "translate", the dropdown shows "(ignored in translate)" in the label and is disabled (`disabled:opacity-50`).
* **Functionality:** Controls the explanation style/tone of AI responses. Irrelevant for pure translation mode.
* **UX Rationale:** Different audiences need different tone — academic users want formal language, learners want simplified explanations.

#### 4.3 Temperature Slider

* **Description:** Range slider from 0 to 1.5, step 0.05, with the current value displayed in accent color.
* **Labels:** "Precise" (left) ↔ "Creative" (right)
* **Visual:** Custom-styled range input with green thumb, 14px diameter, glowing shadow.
* **Functionality:** Controls the temperature parameter sent to OpenRouter. Lower = more deterministic, higher = more creative.
* **UX Rationale:** Temperature is the primary quality knob. Labels "Precise" and "Creative" translate the technical parameter into user-understandable terms.

#### 4.4 Memory Toggle

* **Description:** Checkbox-style toggle in a bordered container with label and description.
* **Label:** "MEMORY"
* **Description text:** "Pass trailing excerpt of previous page into next request"
* **Functionality:** When enabled, the AI receives context from the previous page's translation, improving continuity. Persists to `localStorage`.
* **UX Rationale:** For sequential reading, memory ensures terminology consistency and narrative continuity across pages. The description explains the mechanism plainly.

#### 4.5 Sequential Execution Toggle

* **Description:** Same layout as Memory toggle.
* **Label:** "SEQUENTIAL EXECUTION"
* **Description text:** "Run All Pages processes one at a time, in order"
* **Functionality:** When enabled, batch operations process pages sequentially (maintaining memory context). When disabled, pages could theoretically run in parallel.
* **UX Rationale:** Sequential execution is essential when memory is enabled — parallel execution would break context continuity.

---

### 5. API Management Card

* **Description:** Glass panel for OpenRouter API key configuration. Takes 5/12 columns on desktop.
* **Icon:** 🔑 (primary color)

#### 5.1 API Key Info Box

* **Description:** A monospaced info block explaining the security model: "Browser clients call DocLens server functions. The API key is never exposed to client bundles."
* **UX Rationale:** Addresses security concerns proactively. The monospace styling signals "technical/configuration" context.

#### 5.2 Verify Server Connection Button

* **Description:** Full-width accent-colored button.
* **Functionality:** Calls the server to validate the OPENROUTER_API_KEY environment variable. On success, loads the model list.
* **State Changes:**
  - **Idle:** "Verify Server Connection"
  - **Checking:** "Checking...", `disabled:opacity-40`
* **UX Rationale:** Explicit verification gives users confidence that their setup is correct before attempting translations.

#### 5.3 Status Display

* **Description:** Text line below the button showing validation result.
* **States:**

| Status | Text | Color |
|--------|------|-------|
| `valid` | "Server key validated" | Primary green |
| `missing` | "Missing OPENROUTER_API_KEY" | Destructive red |
| `invalid` | "Invalid server key" | Destructive red |
| `unknown` | "Not checked" | Muted |

---

### 6. Model Selection Card

* **Description:** Glass panel for browsing and selecting AI models. Takes 7/12 columns on desktop.
* **Icon:** 🧠 (yellow)

#### 6.1 Filter Search Input

* **Description:** A `rounded-full` search input (`w-48`) positioned at the top-right of the card header.
* **Functionality:** Filters models by ID or name match. Case-insensitive.

#### 6.2 Filter Tabs

Three toggle buttons in a flex row:

| Tab | Filter Logic |
|-----|-------------|
| **free** | Prompt and completion pricing both equal $0.00 |
| **popular** | Matches regex for well-known models (GPT-4, Claude, Gemini, Llama, etc.) |
| **all** | No filter (text-to-text models only) |

* **Active State:** `border-primary bg-primary/15 text-primary`
* **Inactive State:** `border-border bg-background text-muted-foreground`
* **Default tab:** `free` — helps users start without cost concerns.
* **UX Rationale:** The three tiers address different user needs: free for experimentation, popular for quality, all for specific model needs.

#### 6.3 Model List

* **Description:** Scrollable list (`max-h-[320px]`) of model cards, capped at 200 results.
* **Each model card shows:**
  - Left: Model icon (⭐ if selected, 🔮 otherwise) in a rounded square
  - Center: Model name (bold) + full model ID (muted, smaller)
  - Right: Context length (e.g., "128K CTX") + pricing per 1M tokens
* **Selection behavior:** Clicking a card selects it — persists to `localStorage`.
* **Active State:** `border-primary/30 bg-primary/5 ring-1 ring-primary/50` with green icon
* **Inactive State:** `border-border bg-background` with muted icon
* **Hover:** `hover:bg-surface-2`

**Pre-filtering:** Only text-to-text models are shown. Models with `image`, `vision`, `tts`, `audio`, `whisper`, `dall-e`, `sora`, `video`, `embed`, `moderation`, or `rerank` in their IDs are excluded. Architecture modality is also checked when available.

* **UX Rationale:** The card layout gives each model enough space to show name, ID, and pricing at a glance. The scrollable container prevents the model list from dominating the page.
* **Empty State:** "No models match" centered in the list area.
* **Gated Display:** The entire model list is hidden when the API key is not valid, replaced by "Configure OPENROUTER_API_KEY to load models."

---

## User Journey

```mermaid
flowchart TD
    A[Open /settings] --> B[Page loads current settings from localStorage]
    B --> C[Auto-validate API key]
    C --> D{Key valid?}
    D -->|Yes| E[Load model list from OpenRouter]
    D -->|No| F[Show status: Missing/Invalid]
    E --> G[Display models in list]
    
    H[User selects language chip] --> I[Language saved to localStorage]
    J[User types custom language + Enter] --> I
    
    K[User adjusts Temperature slider] --> L[Value saved immediately]
    M[User toggles Memory checkbox] --> N[Saved to localStorage]
    O[User toggles Sequential checkbox] --> P[Saved to localStorage]
    
    Q[User selects model] --> R[Model ID saved to localStorage]
    S[User clicks 'Verify Server Connection'] --> C
    
    T[User clicks 'Clear AI Cache'] --> U{confirm() dialog}
    U -->|Yes| V[Delete all AI results from IDB]
    V --> W[Toast success + refresh stats]
    U -->|No| X[Cancel]
```

---

## Design Decisions

### 1. Two-Column Top Row
Output Language and Storage Diagnostics are placed side-by-side because they represent the two most frequently accessed settings: "what language do I want?" and "is my storage okay?" This co-location reduces scrolling for the most common settings tasks.

### 2. Live Memory Diagnostics
Including a real-time memory monitor in a settings page is unusual — it's typically found in developer tools. The decision reflects DocLens's target audience (developers and power users working with document AI pipelines) and the application's memory-intensive nature (PDF canvases, WASM TTS, streaming responses).

### 3. Server-Side API Key
The API key is stored as an environment variable on the server, not in the browser. This is a security-first design — the client never sees the key. The Settings page only verifies connectivity rather than allowing key input.

### 4. Free Models as Default Tab
Starting with the "free" filter removes cost anxiety for new users. They can experiment with the application's full feature set before committing to paid models.

### 5. Immediate Persistence
All settings changes (language, mode, temperature, model, memory, sequential) are saved to `localStorage` immediately on change — no "Save" button needed. This reduces friction and prevents data loss from page navigation.

---

## Accessibility Considerations

| Element | Implementation |
|---------|---------------|
| Language chips | Standard `<button>` elements with visible selected state |
| Dropdowns | Native `<select>` elements with keyboard support |
| Temperature slider | Native `<input type="range">` with labeled endpoints |
| Checkboxes | Native `<input type="checkbox">` within `<label>` wrappers |
| Model cards | `<button>` elements, keyboard-focusable |
| Section headings | `<h3>` elements with icon prefixes |
| Status messages | Color-coded text with distinct labels (not color-only) |

> [!NOTE]
> The temperature slider labels ("Precise" / "Creative") use `text-[10px]` sizing which may be difficult to read. Consider increasing to at least 11-12px.

---

## Future Improvement Opportunities

1. **Settings search** — As the settings page grows, a search/filter mechanism would help users find specific options.
2. **Settings profiles** — Save and switch between named configuration sets (e.g., "Academic Hindi", "Casual Spanish").
3. **Model comparison** — Side-by-side quality/speed/cost comparison for selected models.
4. **Cost estimator** — Based on document size and selected model, estimate total translation cost.
5. **Settings export/import** — JSON export of all preferences for backup or team sharing.
6. **Theme customization** — The Deep Ocean palette is hardcoded. A theme picker could offer alternatives.
7. **Rate limiting display** — Show remaining API quota/credits alongside model selection.
8. **Memory diagnostics history** — Graph memory usage over time to identify leak patterns.
9. **Undo for cache clear** — Soft-delete with a grace period before permanent removal.
