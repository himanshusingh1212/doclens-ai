import { useCallback, useEffect, useRef, useState } from "react";
import { loadPdfDocument } from "@/lib/pdf";
import { getDocBinary } from "@/lib/storage";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

interface Props {
  /** Document ID — binary is loaded on-demand from IndexedDB */
  docId: string;
}

const DPR = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
const TARGET_WIDTH = 800;
const BUFFER = 2;

interface PageMeta {
  pageNumber: number;
  cssWidth: number;
  cssHeight: number;
  scale: number;
}

/**
 * PDF viewer that loads the binary on-demand from IndexedDB,
 * then uses pdf.js page.render() for full-fidelity canvas rendering.
 */
export function PdfViewer({ docId }: Props) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageMetas, setPageMetas] = useState<PageMeta[]>([]);
  const [visibleRange, setVisibleRange] = useState<[number, number]>([0, 3]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderedPages = useRef<Set<number>>(new Set());
  const renderingPages = useRef<Set<number>>(new Set());

  // Load PDF binary on-demand from IndexedDB
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDoc(null);
    setPageMetas([]);

    (async () => {
      try {
        const binary = await getDocBinary(docId);
        if (cancelled) return;
        if (!binary) {
          setError("PDF binary not found in storage.");
          setLoading(false);
          return;
        }

        const pdfDoc = await loadPdfDocument(binary);
        if (cancelled) return;
        setDoc(pdfDoc);

        const metas: PageMeta[] = [];
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          const scale = TARGET_WIDTH / vp.width;
          metas.push({
            pageNumber: i,
            cssWidth: TARGET_WIDTH,
            cssHeight: Math.round(vp.height * scale),
            scale,
          });
        }
        if (cancelled) return;
        setPageMetas(metas);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error("PdfViewer: failed to load", err);
        setError("Failed to load PDF.");
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [docId]);

  const renderPage = useCallback(
    async (pageNumber: number) => {
      if (!doc) return;
      if (renderingPages.current.has(pageNumber)) return;
      if (renderedPages.current.has(pageNumber)) return;

      const canvas = canvasRefs.current.get(pageNumber);
      if (!canvas) return;
      const meta = pageMetas[pageNumber - 1];
      if (!meta) return;

      renderingPages.current.add(pageNumber);
      try {
        const page: PDFPageProxy = await doc.getPage(pageNumber);
        const renderScale = meta.scale * DPR;
        const viewport = page.getViewport({ scale: renderScale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${meta.cssWidth}px`;
        canvas.style.height = `${meta.cssHeight}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
        renderedPages.current.add(pageNumber);
      } catch (err) {
        if (err instanceof Error && err.message.includes("cancelled")) return;
        console.error(`PdfViewer: render error page ${pageNumber}`, err);
      } finally {
        renderingPages.current.delete(pageNumber);
      }
    },
    [doc, pageMetas],
  );

  const clearPage = useCallback((pageNumber: number) => {
    const canvas = canvasRefs.current.get(pageNumber);
    if (!canvas) return;
    canvas.width = 1;
    canvas.height = 1;
    renderedPages.current.delete(pageNumber);
  }, []);

  const updateVisibleRange = useCallback(() => {
    const container = scrollRef.current;
    if (!container || pageMetas.length === 0) return;

    const scrollTop = container.scrollTop;
    const viewportHeight = container.clientHeight;
    const scrollBottom = scrollTop + viewportHeight;

    let firstVisible = 0;
    let lastVisible = 0;
    let cumulativeTop = 0;

    for (let i = 0; i < pageMetas.length; i++) {
      const pageBottom = cumulativeTop + pageMetas[i].cssHeight + 12;
      if (pageBottom >= scrollTop) { firstVisible = i; break; }
      cumulativeTop += pageMetas[i].cssHeight + 12;
    }

    cumulativeTop = 0;
    for (let i = 0; i < pageMetas.length; i++) {
      cumulativeTop += pageMetas[i].cssHeight + 12;
      lastVisible = i;
      if (cumulativeTop >= scrollBottom) break;
    }

    setVisibleRange([
      Math.max(0, firstVisible - BUFFER),
      Math.min(pageMetas.length - 1, lastVisible + BUFFER),
    ]);
  }, [pageMetas]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    updateVisibleRange();
    let rafId = 0;
    const handleScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateVisibleRange);
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [updateVisibleRange]);

  useEffect(() => {
    const [first, last] = visibleRange;
    for (let i = first; i <= last; i++) {
      const pn = pageMetas[i]?.pageNumber;
      if (pn) renderPage(pn);
    }
    for (const pn of renderedPages.current) {
      const idx = pn - 1;
      if (idx < first || idx > last) clearPage(pn);
    }
  }, [visibleRange, pageMetas, renderPage, clearPage]);

  useEffect(() => {
    const handleResize = () => updateVisibleRange();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateVisibleRange]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          loading pdf…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="font-mono text-xs uppercase tracking-widest text-destructive">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-auto" style={{ background: "#404040" }}>
      <div className="flex flex-col items-center gap-3 py-4">
        {pageMetas.map((meta, idx) => {
          const inRange = idx >= visibleRange[0] && idx <= visibleRange[1];
          return (
            <div
              key={meta.pageNumber}
              style={{ width: meta.cssWidth, height: meta.cssHeight, maxWidth: "100%" }}
              className="relative flex-shrink-0 shadow-lg"
            >
              <canvas
                ref={(el) => {
                  if (el) canvasRefs.current.set(meta.pageNumber, el);
                  else canvasRefs.current.delete(meta.pageNumber);
                }}
                style={{ width: meta.cssWidth, height: meta.cssHeight, maxWidth: "100%", display: "block", background: "#fff" }}
              />
              <div className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white/80">
                {meta.pageNumber}
              </div>
              {!inRange && (
                <div
                  className="absolute inset-0 flex items-center justify-center bg-white"
                  style={{ width: meta.cssWidth, height: meta.cssHeight, maxWidth: "100%" }}
                >
                  <span className="font-mono text-xs text-gray-400">Page {meta.pageNumber}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
