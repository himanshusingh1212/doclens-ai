import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { estimateTokens } from "@/lib/models";
import { getAllPages, getPageData, type PageAiSummaryEntry } from "@/lib/storage";
import { PageWorkstation } from "./PageWorkstation";

interface Props {
  docId: string;
  pageCount: number;
  analyzing: boolean;
  status: string;
  aiSummary: Record<number, PageAiSummaryEntry>;
  onPageAiChange: (pageNumber: number, entry: PageAiSummaryEntry | null) => void;
  activePage: number;
  setActivePage: (p: number) => void;
}

/* ---------- Export helpers ---------- */

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function exportAsMarkdown(docId: string) {
  const pages = await getAllPages(docId);
  const lines: string[] = ["# DocLens AI — Export", "", `> Exported at ${new Date().toISOString()}`, ""];
  for (const page of pages) {
    lines.push(`## Page ${page.pageNumber}`, "");
    lines.push("### Extracted Text", "");
    lines.push(page.text || "*(no extractable text)*", "");
    if (page.pageAi?.status === "done" && page.pageAi.result) {
      lines.push("### AI Result", "");
      lines.push(page.pageAi.result, "");
    }
    lines.push("---", "");
  }
  downloadBlob(lines.join("\n"), "doclens-export.md", "text/markdown;charset=utf-8");
  toast.success("Exported as Markdown.");
}

async function exportAsJson(docId: string) {
  const pages = await getAllPages(docId);
  const data = pages.map((page) => ({
    pageNumber: page.pageNumber,
    columns: page.columns,
    tokenEstimate: estimateTokens(page.text),
    extractedText: page.text,
    ai:
      page.pageAi?.status === "done" && page.pageAi.result
        ? {
            status: page.pageAi.status,
            result: page.pageAi.result,
            settingsHash: page.pageAi.settingsHash,
            updatedAt: page.pageAi.updatedAt,
          }
        : null,
  }));
  downloadBlob(
    JSON.stringify({ exportedAt: new Date().toISOString(), pages: data }, null, 2),
    "doclens-export.json",
    "application/json;charset=utf-8",
  );
  toast.success("Exported as JSON.");
}

/* ---------- Component ---------- */

type Tab = "ai" | "text";

export function RightPanel({
  docId,
  pageCount,
  analyzing,
  status,
  aiSummary,
  onPageAiChange,
  activePage,
  setActivePage,
}: Props) {
  const [tab, setTab] = useState<Tab>("ai");
  const [showExport, setShowExport] = useState(false);

  const doneCount = useMemo(
    () => Object.values(aiSummary).filter((e) => e.status === "done").length,
    [aiSummary],
  );

  return (
    <div className="flex h-full flex-col bg-surface/30">
      {/* ─── Tab bar ─── */}
      <div className="flex items-center border-b border-border bg-surface/50 backdrop-blur-sm">
        <TabButton active={tab === "ai"} onClick={() => setTab("ai")}>
          AI Assistant
        </TabButton>
        <TabButton active={tab === "text"} onClick={() => setTab("text")}>
          Original Text
        </TabButton>

        <div className="ml-auto flex items-center gap-1 px-3">
          {analyzing && (
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <span className="inline-block h-3 w-3 rounded-full border-[1.5px] border-primary border-t-transparent spin-slow" />
              {status}
            </span>
          )}

          {pageCount > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowExport(!showExport)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                title="Export"
              >
                <span className="text-xs">↓</span>
              </button>
              {showExport && (
                <div className="absolute right-0 top-full z-20 mt-1 rounded-lg border border-border bg-surface p-1 shadow-xl">
                  <button
                    onClick={() => { void exportAsMarkdown(docId); setShowExport(false); }}
                    className="block w-full rounded px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-surface-2"
                  >
                    Export as Markdown
                  </button>
                  <button
                    onClick={() => { void exportAsJson(docId); setShowExport(false); }}
                    className="block w-full rounded px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-surface-2"
                  >
                    Export as JSON
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Body ─── */}
      <div className="flex-1 overflow-hidden">
        {tab === "ai" && (
          <PageWorkstation
            docId={docId}
            pageCount={pageCount}
            aiSummary={aiSummary}
            onPageAiChange={onPageAiChange}
            activePage={activePage}
            setActivePage={setActivePage}
          />
        )}

        {tab === "text" && (
          <ExtractedTextTab docId={docId} activePage={activePage} />
        )}
      </div>
    </div>
  );
}

/* ---------- Extracted text tab — single active page ---------- */

function ExtractedTextTab({ docId, activePage }: { docId: string; activePage: number }) {
  if (activePage <= 0) {
    return (
      <div className="flex h-full items-center justify-center px-5 py-4">
        <div className="max-w-sm text-center text-sm text-muted-foreground">
          Select a page to view its extracted text.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto px-6 py-5 page-card-enter" key={activePage}>
      <ExtractedPageRow docId={docId} pageNumber={activePage} />
    </div>
  );
}

function ExtractedPageRow({ docId, pageNumber }: { docId: string; pageNumber: number }) {
  const [data, setData] = useState<{ text: string; columns: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getPageData(docId, pageNumber);
      if (cancelled) return;
      setData(p ? { text: p.text, columns: p.columns } : { text: "", columns: 1 });
    })();
    return () => {
      cancelled = true;
    };
  }, [docId, pageNumber]);

  if (data === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="inline-block h-3 w-3 rounded-full border-[1.5px] border-primary border-t-transparent spin-slow" />
        Loading page {pageNumber}…
      </div>
    );
  }

  return (
    <article className="reader-card">
      <header className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Page {pageNumber} — Original Text
        </h3>
        <span className="text-[11px] text-muted-foreground/60">
          {data.text ? `${estimateTokens(data.text).toLocaleString()} tokens` : ""}
        </span>
      </header>
      <div className="reader-text">
        {data.text ? (
          <div className="whitespace-pre-wrap break-words">{data.text}</div>
        ) : (
          <p className="italic text-muted-foreground">No extractable text on this page.</p>
        )}
      </div>
    </article>
  );
}

/* ---------- Shared UI primitives ---------- */

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-2.5 text-[13px] font-medium transition-colors ${
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
      {active && <span className="absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-primary" />}
    </button>
  );
}
