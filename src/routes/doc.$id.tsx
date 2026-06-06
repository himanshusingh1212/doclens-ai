import { ClientOnly, createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createClientOnlyFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PdfViewer } from "@/components/PdfViewer";
import { RightPanel } from "@/components/RightPanel";
import {
  getDoc,
  getDocBlob,
  getPageAiSummary,
  setLastOpened,
  touchDoc,
  updateDoc,
  writePages,
  StorageError,
  type DocRecord,
  type PageAiSummaryEntry,
} from "@/lib/storage";

const extractPdfPagesClient = createClientOnlyFn(
  async (
    blob: Blob,
    onPage: (
      page: { pageNumber: number; text: string; columns: number; garbageRatio: number },
      total: number,
    ) => void,
  ) => {
    const { extractPdfPages } = await import("@/lib/pdf");
    return extractPdfPages(blob, onPage);
  },
);

export const Route = createFileRoute("/doc/$id")({
  component: DocPage,
  validateSearch: (search: Record<string, unknown>): { page?: number } => {
    const p = Number(search.page);
    return { page: p > 0 && Number.isFinite(p) ? Math.floor(p) : undefined };
  },
  head: () => ({
    meta: [{ title: "Anuwad — Document Reader" }],
  }),
});

function DocPage() {
  const { id } = Route.useParams();
  const { page: urlPage } = Route.useSearch();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocRecord | null>(null);
  const [missing, setMissing] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [status, setStatus] = useState("");
  /** Lightweight summary only — full text + result are read on demand per page. */
  const [aiSummary, setAiSummary] = useState<Record<number, PageAiSummaryEntry>>({});
  const [activePage, setActivePageRaw] = useState<number>(urlPage ?? 1);

  /** Sync page changes to the URL query param (?page=N) */
  const setActivePage = useCallback(
    (p: number) => {
      setActivePageRaw(p);
      void navigate({
        to: "/doc/$id",
        params: { id },
        search: { page: p },
        replace: true,
      });
    },
    [id, navigate],
  );

  // Stop active playback when leaving the document reader, but keep the workers warm in the JS heap
  useEffect(() => {
    return () => {
      import("@/lib/tts")
        .then((tts) => {
          tts.stopAll();
        })
        .catch((err) => console.warn("[tts-cleanup] failed:", err));
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rec = await getDoc(id);
      if (cancelled) return;
      if (!rec) {
        setMissing(true);
        return;
      }
      setDoc(rec);
      const pc = rec.pageCount ?? 0;
      setPageCount(pc);
      // Clamp activePage if the URL had a page beyond the document's range
      if (pc > 0 && activePage > pc) setActivePageRaw(pc);
      const sum = await getPageAiSummary(id);
      if (cancelled) return;
      setAiSummary(sum);
      await touchDoc(id);
      await setLastOpened(id);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const refreshSummary = async () => {
    const sum = await getPageAiSummary(id);
    setAiSummary(sum);
  };

  const handleAnalyze = async () => {
    if (!doc || analyzing) return;
    setAnalyzing(true);
    setStatus("extracting…");
    try {
      const blob = await getDocBlob(id);
      if (!blob) {
        toast.error("PDF binary not found in storage.");
        setAnalyzing(false);
        return;
      }
      let lastTotal = 0;
      const collected: {
        pageNumber: number;
        text: string;
        columns: number;
        garbageRatio: number;
      }[] = [];
      await extractPdfPagesClient(blob, (page, total) => {
        lastTotal = total;
        collected.push({
          pageNumber: page.pageNumber,
          text: page.text,
          columns: page.columns,
          garbageRatio: page.garbageRatio,
        });
        setPageCount(total);
        setStatus(`page ${page.pageNumber}/${total}`);
      });
      try {
        await writePages(id, collected);
        await updateDoc(id, { pageCount: collected.length });
        setPageCount(collected.length || lastTotal);
        await refreshSummary();
        setStatus(`done · ${collected.length} pages`);
        toast.success(`Extracted ${collected.length} pages successfully.`);
      } catch (e) {
        if (e instanceof StorageError && e.code === "QUOTA_EXCEEDED") {
          toast.error(e.message);
        } else {
          toast.error("Extraction complete but failed to save. Storage may be full.");
        }
      } finally {
        collected.length = 0;
      }
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "unknown";
      setStatus("error: " + msg);
      toast.error(`Extraction failed: ${msg}`);
    } finally {
      setAnalyzing(false);
    }
  };

  /** Called by per-row workstation cards to keep the doc-level summary in sync. */
  const handlePageAiChange = (pageNumber: number, entry: PageAiSummaryEntry | null) => {
    setAiSummary((prev) => {
      const next = { ...prev };
      if (entry) next[pageNumber] = entry;
      else delete next[pageNumber];
      return next;
    });
  };

  /* ─── Edge states ─── */

  if (missing) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <div className="text-sm text-muted-foreground">Document not found</div>
          <Link
            to="/"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
          >
            ← Back to Library
          </Link>
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-primary border-t-transparent spin-slow" />
          Loading document…
        </div>
      </div>
    );
  }

  /* ─── Derive document name ─── */
  const docName = doc.fileName.replace(/\.pdf$/i, "");
  const doneCount = Object.values(aiSummary).filter((e) => e.status === "done").length;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* ─── Slim Document Header ─── */}
      <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-border bg-surface/80 backdrop-blur-md px-4">
        {/* Left: Back + Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate({ to: "/" })}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            title="Back to Library"
          >
            ←
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-foreground">{docName}</h1>
          </div>
        </div>

        {/* Center: Page Navigation */}
        {pageCount > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActivePage(Math.max(1, activePage - 1))}
              disabled={activePage <= 1}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-base text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-30"
              aria-label="Previous page"
            >
              ‹
            </button>
            <div className="flex h-8 items-center gap-2 rounded-md bg-surface-2/60 px-3">
              <select
                value={activePage}
                onChange={(e) => setActivePage(Number(e.target.value))}
                className="cursor-pointer bg-transparent pl-1 pr-6 text-center text-xs font-medium tabular-nums text-foreground outline-none"
                style={{ minWidth: `${Math.max(3.75, String(pageCount).length + 3)}rem` }}
                aria-label="Select page"
              >
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n} className="bg-surface">
                    {n}
                  </option>
                ))}
              </select>
              <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                / {pageCount}
              </span>
            </div>
            <button
              onClick={() => setActivePage(Math.min(pageCount, activePage + 1))}
              disabled={activePage >= pageCount}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-base text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-30"
              aria-label="Next page"
            >
              ›
            </button>
            {doneCount > 0 && (
              <span className="ml-1 text-[10px] text-primary font-medium">
                {doneCount} translated
              </span>
            )}
          </div>
        )}

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          {!pageCount && (
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {analyzing ? "Analyzing…" : "Analyze Document"}
            </button>
          )}
          {pageCount > 0 && (
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
              title={analyzing ? status : "Re-extract pages"}
            >
              {analyzing ? (
                <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent spin-slow" />
              ) : (
                <span className="text-sm">↻</span>
              )}
            </button>
          )}
          <Link
            to="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            title="Settings"
          >
            <span className="text-sm">⚙</span>
          </Link>
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <ClientOnly
        fallback={
          <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="inline-block h-4 w-4 rounded-full border-2 border-primary border-t-transparent spin-slow" />
              Loading…
            </div>
          </main>
        }
      >
        <main className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
          <section className="relative h-full overflow-hidden">
            <PdfViewer docId={id} activePage={activePage} setActivePage={setActivePage} />
          </section>
          <section className="h-full overflow-hidden border-t border-border md:border-t-0 md:border-l">
            <RightPanel
              docId={id}
              pageCount={pageCount}
              analyzing={analyzing}
              status={status}
              aiSummary={aiSummary}
              onPageAiChange={handlePageAiChange}
              activePage={activePage}
              setActivePage={setActivePage}
            />
          </section>
        </main>
      </ClientOnly>
    </div>
  );
}
