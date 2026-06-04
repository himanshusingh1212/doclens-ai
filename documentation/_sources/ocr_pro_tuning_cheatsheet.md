# ⚙️ OCR Tuning Cheat Sheet

> All values marked with `⚙️ TWEAK` in the code. Change them, save, and hot-reload to test.
> **Enable debug logs:** Open browser console → `window.__OCR_DEBUG__ = true` → re-run OCR.

---

## 🔧 Quick Fix by Symptom

### 🔴 Too many columns (text splitting where it shouldn't)

| What to change | File | Current | Try |
|---|---|---|---|
| `SPLIT_FACTOR` | [column-layout.ts](file:///home/sanskar/Documents/OCR-PRO/src/lib/column-layout.ts#L60) | `3.5` | `4.5` – `6.0` |
| `laneGapThreshold` pageWidth multiplier | [column-layout.ts](file:///home/sanskar/Documents/OCR-PRO/src/lib/column-layout.ts#L345) | `0.08` | `0.12` – `0.15` |
| `laneGapThreshold` wordGap multiplier | [column-layout.ts](file:///home/sanskar/Documents/OCR-PRO/src/lib/column-layout.ts#L346) | `4` | `5` – `6` |
| `gutterThreshold` wordGap multiplier | [column-layout.ts](file:///home/sanskar/Documents/OCR-PRO/src/lib/column-layout.ts#L172) | `2.5` | `3.5` |
| `q1 percentile` | [column-layout.ts](file:///home/sanskar/Documents/OCR-PRO/src/lib/column-layout.ts#L214) | `0.3` | `0.4` – `0.5` |

### 🔴 Too few columns (real columns merging into one)

| What to change | File | Current | Try |
|---|---|---|---|
| `SPLIT_FACTOR` | [column-layout.ts](file:///home/sanskar/Documents/OCR-PRO/src/lib/column-layout.ts#L60) | `3.5` | `2.0` – `3.0` |
| `laneGapThreshold` pageWidth multiplier | [column-layout.ts](file:///home/sanskar/Documents/OCR-PRO/src/lib/column-layout.ts#L345) | `0.08` | `0.04` – `0.06` |
| `laneGapThreshold` wordGap multiplier | [column-layout.ts](file:///home/sanskar/Documents/OCR-PRO/src/lib/column-layout.ts#L346) | `4` | `2` – `3` |
| `q1 percentile` | [column-layout.ts](file:///home/sanskar/Documents/OCR-PRO/src/lib/column-layout.ts#L214) | `0.3` | `0.15` – `0.25` |

### 🔴 Column boxes overlapping figures/images

| What to change | File | Current | Try |
|---|---|---|---|
| `maxVertGap` multiplier | [column-layout.ts](file:///home/sanskar/Documents/OCR-PRO/src/lib/column-layout.ts#L365) | `2.5` | `1.5` – `2.0` |

### 🔴 Column text mixing with neighbor during re-OCR

| What to change | File | Current | Try |
|---|---|---|---|
| `horizontalPadding` ratio | [ocr-engine.ts](file:///home/sanskar/Documents/OCR-PRO/src/lib/ocr-engine.ts#L425) | `0.08` | `0.04` – `0.06` |
| `horizontalPadding` min px | [ocr-engine.ts](file:///home/sanskar/Documents/OCR-PRO/src/lib/ocr-engine.ts#L425) | `24` | `12` – `16` |

### 🔴 Lines merging or splitting incorrectly

| What to change | File | Current | Try |
|---|---|---|---|
| `lineThreshold` multiplier | [column-layout.ts](file:///home/sanskar/Documents/OCR-PRO/src/lib/column-layout.ts#L184) | `0.6` | `0.4` (split more) – `0.8` (merge more) |

### 🔴 Wrong block labeling (headings misclassified)

| What to change | File | Current | Try |
|---|---|---|---|
| `HEADING_MAX_WORDS` | [column-layout.ts](file:///home/sanskar/Documents/OCR-PRO/src/lib/column-layout.ts#L70) | `14` | `8` – `20` |
| `HEADING_MAX_WIDTH_RATIO` | [column-layout.ts](file:///home/sanskar/Documents/OCR-PRO/src/lib/column-layout.ts#L79) | `0.75` | `0.5` – `0.9` |
| Heading isolation gap | [column-layout.ts](file:///home/sanskar/Documents/OCR-PRO/src/lib/column-layout.ts#L483) | `1.5` | `0.8` – `3.0` |

---

## 🏗️ Architecture Overview

```
PDF Page
  → Tesseract.js OCR → raw word tokens with bounding boxes
  → column-layout.ts:
      1. groupTokensIntoLines()    ← lineThreshold
      2. splitLinesIntoSegments()  ← SPLIT_FACTOR, gutterThreshold  
      3. clusterSegmentsIntoBlocks() ← laneGapThreshold (★ MOST IMPORTANT)
      4. assignLayoutRoles()       ← HEADING thresholds
      5. sortBlocks()              ← row grouping threshold
  → ocr-engine.ts:
      6. refineColumnsWithColumnOcr() ← crop padding, COLUMN_RERUN_MIN_COUNT
  → PdfViewer.tsx:
      7. computeNonOverlappingBboxes() ← GUTTER (visual only)
```

## 🎯 For Your Screenshot Issue

Looking at your screenshot (Col 2 side, Col 3 side, Col 4 side, Col 5, Col 7), the sidebar image+caption area is being treated as separate columns. The **#1 knob** to fix this:

1. **Raise `laneGapThreshold`** — change `pageWidth * 0.08` → `pageWidth * 0.12` and `medianWordGap * 4` → `medianWordGap * 6`
2. **Raise `maxVertGap`** — change `medianHeight * 2.5` → `medianHeight * 3.5` to merge the vertically stacked sidebar pieces

Try these two changes first, then adjust from there!
