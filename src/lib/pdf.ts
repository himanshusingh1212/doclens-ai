import type * as PdfJs from "pdfjs-dist";

let pdfjsPromise: Promise<typeof PdfJs> | null = null;
async function getPdfjs(): Promise<typeof PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib = await import("pdfjs-dist");
      const WorkerCtor = (await import("pdfjs-dist/build/pdf.worker.min.mjs?worker")).default;
      lib.GlobalWorkerOptions.workerPort = new WorkerCtor();
      return lib;
    })();
  }
  return pdfjsPromise;
}

/**
 * Common options for getDocument: enables CMap decoding for non-Latin scripts
 * (Hindi/Devanagari, CJK, Arabic, etc.) and standard font metrics.
 */
const PDF_LOAD_OPTIONS = {
  cMapUrl: "/pdf/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdf/standard_fonts/",
  useSystemFonts: true,
} as const;

/**
 * Regex matching Unicode Private Use Area (PUA) characters.
 * These appear as garbled glyphs when fonts lack proper ToUnicode mappings.
 * Ranges: BMP PUA (E000-F8FF), Supplementary PUA-A (F0000-FFFFD),
 *         Supplementary PUA-B (100000-10FFFD)
 */
const PUA_REGEX = /[\uE000-\uF8FF]|\uDB80[\uDC00-\uDFFD]|\uDBC0[\uDC00-\uDFFD]/g;

/**
 * Replacement char / surrogate / control char ranges (except normal whitespace).
 */
const GARBAGE_REGEX = /[\uFFFD\uFFFE\uFFFF]|[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

/**
 * Clean extracted text by stripping unmappable PUA glyphs and garbage characters.
 * Returns the cleaned string plus a ratio of how much was garbage (0–1).
 */
function cleanExtractedText(raw: string): { text: string; garbageRatio: number } {
  if (!raw) return { text: "", garbageRatio: 0 };

  const puaMatches = raw.match(PUA_REGEX);
  const garbageMatches = raw.match(GARBAGE_REGEX);
  const totalGarbage = (puaMatches?.length ?? 0) + (garbageMatches?.length ?? 0);
  const nonSpaceChars = raw.replace(/\s/g, "").length;
  const garbageRatio = nonSpaceChars > 0 ? totalGarbage / nonSpaceChars : 0;

  let cleaned = raw
    .replace(PUA_REGEX, "")
    .replace(GARBAGE_REGEX, "");

  // Collapse whitespace artifacts left after stripping
  cleaned = cleaned
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^ +| +$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text: cleaned, garbageRatio };
}

export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageExtraction {
  pageNumber: number;
  text: string;
  items: TextItem[];
  columns: number;
  /** Ratio of garbage/PUA chars found before cleaning (0–1). High values suggest legacy font issues. */
  garbageRatio: number;
}

/**
 * Detect columns by clustering text items along the X axis.
 * Returns column count (1-3 typical).
 */
function detectColumns(items: TextItem[], pageWidth: number): number {
  if (items.length < 20) return 1;
  const xs = items.map((i) => i.x).sort((a, b) => a - b);
  // Simple heuristic: bucket into 10 vertical bands, look for bimodal/trimodal distribution
  const buckets = new Array(10).fill(0);
  for (const x of xs) {
    const idx = Math.min(9, Math.floor((x / pageWidth) * 10));
    buckets[idx]++;
  }
  // Find peaks separated by valleys
  const peaks: number[] = [];
  for (let i = 1; i < 9; i++) {
    if (buckets[i] > buckets[i - 1] && buckets[i] >= buckets[i + 1] && buckets[i] > items.length * 0.08) {
      peaks.push(i);
    }
  }
  if (buckets[0] > items.length * 0.08) peaks.unshift(0);
  return Math.max(1, Math.min(3, peaks.length || 1));
}

/**
 * Sort text items respecting detected columns: split by X bands, then top→bottom within each.
 */
function sortByColumns(items: TextItem[], pageWidth: number, columns: number): TextItem[] {
  if (columns <= 1) {
    return [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  }
  const bandWidth = pageWidth / columns;
  const bands: TextItem[][] = Array.from({ length: columns }, () => []);
  for (const item of items) {
    const band = Math.min(columns - 1, Math.floor(item.x / bandWidth));
    bands[band].push(item);
  }
  return bands.flatMap((band) =>
    band.sort((a, b) => b.y - a.y || a.x - b.x),
  );
}

async function loadDocFromSource(source: ArrayBuffer | Blob) {
  const pdfjsLib = await getPdfjs();
  const blob = source instanceof Blob ? source : new Blob([source], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  try {
    const pdf = await pdfjsLib.getDocument({ url, ...PDF_LOAD_OPTIONS }).promise;
    return pdf;
  } finally {
    // Once pdf.js has fetched the bytes it keeps its own internal copy.
    URL.revokeObjectURL(url);
  }
}

/** Concurrent page extraction. pdf.js is single-threaded inside the worker
 *  but `getPage` + `getTextContent` involve I/O round-trips — modest
 *  concurrency hides that latency without overloading the worker. */
const EXTRACTION_CONCURRENCY = 4;

export async function extractPdfPages(
  data: ArrayBuffer | Blob,
  onPage?: (page: PageExtraction, total: number) => void,
): Promise<PageExtraction[]> {
  const pdf = await loadDocFromSource(data);
  try {
    const total = pdf.numPages;
    const pages: PageExtraction[] = new Array(total);

    async function extractOne(pageNumber: number): Promise<PageExtraction> {
      const page = await pdf.getPage(pageNumber);
      try {
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const items: TextItem[] = [];
        for (const it of content.items as any[]) {
          if (typeof it.str !== "string") continue;
          const tx = it.transform;
          items.push({
            str: it.str as string,
            x: tx[4] as number,
            y: tx[5] as number,
            width: it.width as number,
            height: it.height as number,
          });
        }
        const columns = detectColumns(items, viewport.width);
        const sorted = sortByColumns(items, viewport.width, columns);

        let rawText = "";
        let lastY: number | null = null;
        for (const it of sorted) {
          if (lastY !== null && Math.abs(it.y - lastY) > 4) rawText += "\n";
          else if (rawText && !rawText.endsWith(" ") && !rawText.endsWith("\n")) rawText += " ";
          rawText += it.str;
          lastY = it.y;
        }
        rawText = rawText.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

        // Release the intermediate TextItem array references immediately
        items.length = 0;
        sorted.length = 0;

        const { text, garbageRatio } = cleanExtractedText(rawText);

        if (garbageRatio > 0.3) {
          console.warn(
            `Page ${pageNumber}: ${Math.round(garbageRatio * 100)}% garbage chars detected — ` +
            `PDF likely uses legacy/non-Unicode fonts. Text may be incomplete.`,
          );
        }

        // NOTE: We intentionally drop the per-item `items[]` from the returned
        // extraction — the caller stores only `{pageNumber, text, columns,
        // garbageRatio}`, and the live PdfViewer re-fetches its own text layer
        // directly. Keeping items here just allocated then immediately GC'd a
        // few MB per large page, and re-cleaning each item's `str` doubled the
        // regex work on data that was thrown away.
        return {
          pageNumber,
          text,
          items: [],
          columns,
          garbageRatio,
        };
      } finally {
        // Release the operator list / decoded fonts pdf.js caches per page so
        // a 500-page document doesn't keep all pages hot at once.
        try { page.cleanup(); } catch { /* ignore */ }
      }
    }

    // Process in concurrency-bounded waves, preserving page order in `pages[]`
    // and firing onPage in ascending order.
    let nextEmit = 1;
    const ready = new Map<number, PageExtraction>();
    for (let start = 1; start <= total; start += EXTRACTION_CONCURRENCY) {
      const batch = [];
      for (let i = 0; i < EXTRACTION_CONCURRENCY && start + i <= total; i++) {
        batch.push(extractOne(start + i));
      }
      const results = await Promise.all(batch);
      for (const r of results) {
        pages[r.pageNumber - 1] = r;
        ready.set(r.pageNumber, r);
      }
      while (ready.has(nextEmit)) {
        const r = ready.get(nextEmit)!;
        ready.delete(nextEmit);
        onPage?.(r, total);
        nextEmit++;
      }
    }
    return pages;
  } finally {
    try {
      await pdf.destroy();
    } catch {
      // ignore
    }
  }
}

export async function loadPdfDocument(data: ArrayBuffer | Blob) {
  return loadDocFromSource(data);
}

// Vite Hot Module Replacement (HMR) cleanup
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try {
      if (pdfjsPromise) {
        pdfjsPromise.then((lib) => {
          try {
            lib.GlobalWorkerOptions.workerPort?.terminate();
          } catch { /* ignore */ }
        }).catch(() => {});
      }
    } catch (e) {
      console.warn("[HMR] Failed to dispose PDFJS worker:", e);
    }
  });
}

