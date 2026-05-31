import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { estimateTokens } from "@/lib/models";
import { ExplainSetupDialog } from "@/components/ExplainSetupDialog";
import { TtsVoiceSetupDialog } from "@/components/TtsVoiceSetupDialog";
import {
  buildPagePayload,
  fetchModels,
  getEffectiveSelectedModel,
  getKey,
  getKeyStatus,
  getMemory,
  getMode,
  getOutputLanguage,
  getSelectedModel,
  getSequential,
  getStyle,
  getTemperature,
  memoryExcerpt,
  MODE_INSTRUCTIONS,
  EXPLANATION_STYLES,
  onKeyChange,
  OpenRouterError,
  openApiKeyModal,
  setMode as saveMode,
  setOutputLanguage,
  setStyle as saveStyle,
  streamCompletion,
  mapLimit,
  validateKey,
  type ExplanationStyle,
  type GlobalMode,
  type KeyStatus,
  type ORModel,
} from "@/lib/openrouter";

import {
  computeSettingsHash,
  getPageData,
  upsertPageAi,
  type PageAi,
  type PageAiSummaryEntry,
  type PageOverrides,
} from "@/lib/storage";
import {
  createSmartTtsController,
  hasTtsSelection,
  isTtsSupported,
  stopAll as stopAllTts,
} from "@/lib/tts";

interface Props {
  docId: string;
  pageCount: number;
  aiSummary: Record<number, PageAiSummaryEntry>;
  onPageAiChange: (pageNumber: number, entry: PageAiSummaryEntry | null) => void;
  activePage: number;
  setActivePage: (p: number) => void;
}

const STYLES = EXPLANATION_STYLES.map((s) => s.id);
const QUICK_LANGS = ["हिंदी", "বাংলা", "తెలుగు", "മലയാളം", "English", "Spanish", "French", "Japanese"];

/** Throttle setState to at most once per `ms` while leading-edge fires immediately. */
const STREAM_FLUSH_MS = 150;

interface RunAllBatch {
  cancelled: boolean;
}

type PendingExplainAction =
  | { type: "page"; pageNumber: number }
  | { type: "all" };

interface Globals {
  mode: GlobalMode;
  language: string;
  modelId: string;
  style: string;
  temperature: number;
  memory: boolean;
  sequential: boolean;
}

function effective(globals: Globals, ov?: PageOverrides) {
  return {
    mode: ov?.mode ?? globals.mode,
    language: ov?.language ?? globals.language,
    modelId: ov?.modelId ?? globals.modelId,
    style: ov?.style ?? globals.style,
    temperature: ov?.temperature ?? globals.temperature,
    memory: ov?.memory ?? globals.memory,
  };
}

function readGlobals(): Globals {
  return {
    mode: getMode(),
    language: getOutputLanguage(),
    modelId: getSelectedModel(),
    style: getStyle(),
    temperature: getTemperature(),
    memory: getMemory(),
    sequential: getSequential(),
  };
}

async function readEffectiveGlobals(): Promise<Globals> {
  const globals = readGlobals();
  return {
    ...globals,
    modelId: globals.modelId || (await getEffectiveSelectedModel()),
  };
}

function summarize(ai: PageAi): PageAiSummaryEntry {
  return {
    status: ai.status,
    hasResult: !!ai.result,
    isCustom: ai.isCustom,
    settingsHash: ai.settingsHash,
  };
}

export function PageWorkstation({ docId, pageCount, aiSummary, onPageAiChange, activePage, setActivePage }: Props) {
  const [globals, setGlobals] = useState<Globals>(readGlobals);
  const [models, setModels] = useState<ORModel[]>([]);
  const [runningPages, setRunningPages] = useState<Set<number>>(new Set());
  /** Live streaming buffers (debounced via setInterval flusher). */
  const [streamBufs, setStreamBufs] = useState<Record<number, string>>({});

  const abortMap = useRef<Map<number, AbortController>>(new Map());
  const runAllRef = useRef<RunAllBatch | null>(null);
  const [runAllActive, setRunAllActive] = useState(false);
  const [runAllProgress, setRunAllProgress] = useState<{ current: number; total: number; errors: number } | null>(null);
  const [explainSetupOpen, setExplainSetupOpen] = useState(false);
  const [pendingExplainAction, setPendingExplainAction] = useState<PendingExplainAction | null>(null);
  const mountedRef = useRef(true);
  /** One-shot text overrides keyed by pageNumber (from PDF selection translate). */
  const selectionOverridesRef = useRef<Map<number, string>>(new Map());

  const aiSummaryRef = useRef(aiSummary);
  aiSummaryRef.current = aiSummary;
  const globalsRef = useRef(globals);
  globalsRef.current = globals;
  const onPageAiChangeRef = useRef(onPageAiChange);
  onPageAiChangeRef.current = onPageAiChange;
  const explainSetupKey = `doclens.explain.setup.${docId}`;

  // Cleanup: abort everything on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortMap.current.forEach((c) => c.abort());
      abortMap.current.clear();
      if (runAllRef.current) runAllRef.current.cancelled = true;
      // Fully tear down Piper engine to reclaim WASM/AudioContext memory
      import("@/lib/neural-tts/piper-engine").then((p) => p.destroyEngine()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    const onFocus = () => setGlobals(readGlobals());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const shouldShowExplainSetup = useCallback(() => {
    if (typeof window === "undefined") return false;
    return globalsRef.current.mode === "explain" && localStorage.getItem(explainSetupKey) !== "1";
  }, [explainSetupKey]);

  useEffect(() => {
    if (globalsRef.current.modelId) return;
    void getEffectiveSelectedModel().then((modelId) => {
      if (!modelId || getSelectedModel()) return;
      setGlobals((current) => {
        if (current.modelId) return current;
        const next = { ...current, modelId };
        globalsRef.current = next;
        return next;
      });
    });
  }, []);

  useEffect(() => {
    const k = getKey();
    if (!k) return;
    fetchModels(k).then(setModels).catch(() => {});
  }, []);

  const [keyStatus, setKeyStatusState] = useState<KeyStatus>("unknown");
  useEffect(() => {
    setKeyStatusState(getKeyStatus());
    return onKeyChange(() => {
      setKeyStatusState(getKeyStatus());
      const k = getKey();
      if (k) fetchModels(k).then(setModels).catch(() => {});
    });
  }, []);

  const hasKey = !!getKey();
  const keyReady = keyStatus !== "invalid" && keyStatus !== "missing" && hasKey;

  /** Returns true if the key is usable; otherwise opens modal + shows toast and returns false. */
  const ensureKeyReady = useCallback((): boolean => {
    if (!getKey()) {
      toast.error("Configure OPENROUTER_API_KEY to run translations.");
      openApiKeyModal("Add a valid server OPENROUTER_API_KEY to start translating.");
      return false;
    }
    if (getKeyStatus() === "invalid") {
      toast.error("The server OpenRouter key is invalid or expired.");
      openApiKeyModal("The server OpenRouter key is invalid or expired.");
      return false;
    }
    return true;
  }, []);

  const ensureRunAllKeyReady = useCallback(async (): Promise<boolean> => {
    const key = getKey().trim();
    if (!ensureKeyReady() || !key) return false;

    const valid = await validateKey(key);
    setKeyStatusState(getKeyStatus());
    if (valid) return true;

    const invalid = getKeyStatus() === "invalid";
    const message = invalid
      ? "The server OpenRouter key is invalid or expired. Run All stopped before processing pages."
      : "Could not verify the server OpenRouter key. Run All stopped before processing pages.";
    toast.error(message);
    if (invalid) openApiKeyModal(message);
    return false;
  }, [ensureKeyReady]);

  /* ---------- Per-page execution ---------- */

  const runPage = useCallback(
    async (pageNumber: number, prevExcerpt?: string, batch?: RunAllBatch): Promise<string | undefined> => {
      const key = getKey();
      const currentGlobals = globalsRef.current;
      if (!key) {
        ensureKeyReady();
        return;
      }
      if (batch?.cancelled) return;


      // Read fresh page text + state from IDB
      const pageRec = await getPageData(docId, pageNumber);
      if (!pageRec) return;
      if (batch?.cancelled) return;
      const state: PageAi = pageRec.pageAi ?? { pageNumber, status: "idle" };
      const eff = effective(currentGlobals, state.overrides);
      if (!eff.modelId) return;
      if (batch?.cancelled) return;

      stopAllTts();

      // One-shot selection override (from PDF text selection → "Translate")
      const selOverride = selectionOverridesRef.current.get(pageNumber);
      if (selOverride) selectionOverridesRef.current.delete(pageNumber);
      const effectiveText = selOverride ?? pageRec.text;

      let payload: Record<string, unknown>;
      if (state.isCustom && state.customRequest) {
        payload = { ...state.customRequest, stream: true };
      } else {
        payload = buildPagePayload({
          modelId: eff.modelId,
          mode: eff.mode,
          language: eff.language,
          style: eff.style,
          temperature: eff.temperature,
          pageNumber,
          pageText: effectiveText,
          previousExcerpt: eff.memory ? prevExcerpt : undefined,
        });
      }

      const hash = computeSettingsHash({
        modelId: eff.modelId,
        mode: eff.mode,
        language: eff.language,
        style: eff.style,
        temperature: eff.temperature,
        memory: eff.memory,
      });

      const ctrl = new AbortController();
      abortMap.current.set(pageNumber, ctrl);
      if (batch?.cancelled) {
        abortMap.current.delete(pageNumber);
        return;
      }
      if (mountedRef.current) {
        setRunningPages((s) => new Set(s).add(pageNumber));
        setStreamBufs((b) => ({ ...b, [pageNumber]: "" }));
      }

      // Persist running status
      await upsertPageAi(docId, pageNumber, { status: "running", error: undefined });
      onPageAiChangeRef.current(pageNumber, { status: "running", hasResult: !!state.result, isCustom: state.isCustom, settingsHash: state.settingsHash });

      // ---- Debounced UI flush ----
      const bufferRef = { current: "" };
      const lastUiRef = { current: "" };
      const flushUi = () => {
        if (!mountedRef.current) return;
        if (bufferRef.current === lastUiRef.current) return;
        lastUiRef.current = bufferRef.current;
        const snapshot = bufferRef.current;
        setStreamBufs((b) => ({ ...b, [pageNumber]: snapshot }));
      };
      const flushTimer = setInterval(flushUi, STREAM_FLUSH_MS);

      try {
        if (batch?.cancelled) {
          ctrl.abort();
          return;
        }
        await streamCompletion({
          key,
          payload,
          signal: ctrl.signal,
          onDelta: (d) => {
            bufferRef.current += d;
          },
        });
        // Final flush before persisting to IDB
        flushUi();
        const result = bufferRef.current;
        await upsertPageAi(docId, pageNumber, {
          status: "done",
          result,
          error: undefined,
          settingsHash: hash,
        });
        onPageAiChangeRef.current(pageNumber, summarize({
          ...state,
          status: "done",
          result,
          settingsHash: hash,
        }));
        return result;
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          const status = state.result ? "done" : "idle";
          await upsertPageAi(docId, pageNumber, { status });
          onPageAiChangeRef.current(pageNumber, { ...summarize(state), status });
        } else {
          const err = e instanceof Error ? e.message : "Unknown error";
          await upsertPageAi(docId, pageNumber, { status: "error", error: err });
          onPageAiChangeRef.current(pageNumber, { ...summarize(state), status: "error" });
          if (e instanceof OpenRouterError && e.kind === "auth") {
            toast.error(err);
            openApiKeyModal(err);
          } else if (e instanceof OpenRouterError) {
            toast.error(err);
          }
        }

      } finally {
        clearInterval(flushTimer);
        abortMap.current.delete(pageNumber);
        if (mountedRef.current) {
          setRunningPages((s) => {
            const n = new Set(s);
            n.delete(pageNumber);
            return n;
          });
          setStreamBufs((b) => {
            const next = { ...b };
            delete next[pageNumber];
            return next;
          });
        }
      }
    },
    [docId],
  );

  const cancelPage = useCallback((pageNumber: number) => {
    abortMap.current.get(pageNumber)?.abort();
  }, []);

  // Listen for PDF-viewer "translate selection" events
  const runPageRef = useRef(runPage);
  runPageRef.current = runPage;
  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ docId: string; pageNumber: number; text: string }>;
      const d = ev.detail;
      if (!d || d.docId !== docId || !d.text) return;
      selectionOverridesRef.current.set(d.pageNumber, d.text);
      void runPageRef.current(d.pageNumber);
    };
    window.addEventListener("doclens:translate-selection", handler);
    return () => window.removeEventListener("doclens:translate-selection", handler);
  }, [docId]);

  const runPageWithSetup = useCallback((pageNumber: number) => {
    if (shouldShowExplainSetup()) {
      setPendingExplainAction({ type: "page", pageNumber });
      setExplainSetupOpen(true);
      return;
    }
    void runPage(pageNumber);
  }, [runPage, shouldShowExplainSetup]);

  const runAllPages = async () => {
    if (!(await ensureRunAllKeyReady())) return;
    const freshGlobals = await readEffectiveGlobals();
    globalsRef.current = freshGlobals;
    setGlobals(freshGlobals);


    const batch: RunAllBatch = { cancelled: false };
    runAllRef.current = batch;
    setRunAllActive(true);
    let prev: string | undefined;
    let errorCount = 0;
    let processedCount = 0;
    const totalToProcess = pageCount;

    if (mountedRef.current) setRunAllProgress({ current: 0, total: totalToProcess, errors: 0 });

    if (freshGlobals.sequential) {
      for (let n = 1; n <= pageCount; n++) {
        if (batch.cancelled) break;
        const pageRec = await getPageData(docId, n);
        if (batch.cancelled) break;
        if (!pageRec) {
          processedCount++;
          if (mountedRef.current) setRunAllProgress({ current: processedCount, total: totalToProcess, errors: errorCount });
          continue;
        }
        const state: PageAi = pageRec.pageAi ?? { pageNumber: n, status: "idle" };
        const currentGlobals = readGlobals();
        const eff = effective(currentGlobals, state.overrides);
        const hash = computeSettingsHash({
          modelId: eff.modelId,
          mode: eff.mode,
          language: eff.language,
          style: eff.style,
          temperature: eff.temperature,
          memory: eff.memory,
        });
        const skip =
          state.status === "done" &&
          state.settingsHash === hash &&
          !state.isCustom &&
          !!state.result;
        if (skip) {
          if (eff.memory) prev = memoryExcerpt(state.result);
          processedCount++;
          if (mountedRef.current) setRunAllProgress({ current: processedCount, total: totalToProcess, errors: errorCount });
          continue;
        }
        try {
          const out = await runPage(n, prev, batch);
          if (batch.cancelled) break;
          if (out && eff.memory) prev = memoryExcerpt(out);
        } catch {
          errorCount++;
        }
        processedCount++;
        if (mountedRef.current) setRunAllProgress({ current: processedCount, total: totalToProcess, errors: errorCount });
      }
    } else {
      let completed = 0;
      const numbers = Array.from({ length: pageCount }, (_, i) => i + 1);
      const results = await mapLimit(
        numbers,
        3,
        async (n) => {
          if (batch.cancelled) return { status: "fulfilled" as const, value: undefined };
          const pageRec = await getPageData(docId, n);
          if (batch.cancelled) return { status: "fulfilled" as const, value: undefined };
          if (!pageRec) return { status: "fulfilled" as const, value: undefined };
          const state: PageAi = pageRec.pageAi ?? { pageNumber: n, status: "idle" };
          const currentGlobals = readGlobals();
          const eff = effective(currentGlobals, state.overrides);
          const hash = computeSettingsHash({
            modelId: eff.modelId,
            mode: eff.mode,
            language: eff.language,
            style: eff.style,
            temperature: eff.temperature,
            memory: eff.memory,
          });
          if (state.status === "done" && state.settingsHash === hash && !state.isCustom && state.result) {
            completed++;
            if (mountedRef.current) setRunAllProgress({ current: completed, total: totalToProcess, errors: errorCount });
            return { status: "fulfilled" as const, value: undefined };
          }
          if (batch.cancelled) return { status: "fulfilled" as const, value: undefined };
          try {
            const result = await runPage(n, undefined, batch);
            completed++;
            if (mountedRef.current) setRunAllProgress({ current: completed, total: totalToProcess, errors: errorCount });
            return { status: "fulfilled" as const, value: result };
          } catch (e) {
            completed++;
            errorCount++;
            if (mountedRef.current) setRunAllProgress({ current: completed, total: totalToProcess, errors: errorCount });
            return { status: "rejected" as const, reason: e };
          }
        }
      );
      errorCount = results.filter((r) => r.status === "rejected").length;
    }

    if (batch.cancelled) {
      toast.info("Run All cancelled.", { duration: 3000 });
    } else if (errorCount > 0) {
      toast.warning(
        `Completed with ${errorCount} error${errorCount > 1 ? "s" : ""}. Check individual pages for details.`,
        { duration: 5000 },
      );
    } else {
      toast.success(`All ${totalToProcess} pages processed successfully.`, { duration: 3000 });
    }

    if (mountedRef.current && runAllRef.current === batch) {
      setRunAllActive(false);
      setRunAllProgress(null);
    }
    if (runAllRef.current === batch) runAllRef.current = null;
  };

  const handleRunAll = () => {
    if (shouldShowExplainSetup()) {
      setPendingExplainAction({ type: "all" });
      setExplainSetupOpen(true);
      return;
    }
    void runAllPages();
  };

  const handleExplainSetupConfirm = async (settings: { language: string; style: ExplanationStyle }) => {
    saveMode("explain");
    setOutputLanguage(settings.language);
    saveStyle(settings.style);
    localStorage.setItem(explainSetupKey, "1");

    const nextGlobals = {
      ...(await readEffectiveGlobals()),
      mode: "explain" as const,
      language: settings.language,
      style: settings.style,
    };
    globalsRef.current = nextGlobals;
    setGlobals(nextGlobals);
    setExplainSetupOpen(false);

    const action = pendingExplainAction;
    setPendingExplainAction(null);
    if (action?.type === "all") void runAllPages();
    else if (action?.type === "page") void runPage(action.pageNumber);
  };

  const cancelRunAll = () => {
    if (runAllRef.current) runAllRef.current.cancelled = true;
    abortMap.current.forEach((c) => c.abort());
    if (mountedRef.current) {
      setRunAllActive(false);
      setRunAllProgress(null);
    }
  };

  /* ---------- Empty / setup states ---------- */

  if (!keyReady || !globals.modelId) {
    const noKey = !hasKey;
    const invalid = keyStatus === "invalid";
    const missing = keyStatus === "missing";
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="max-w-xs">
          <div className={`text-sm font-medium ${invalid ? "text-destructive" : "text-foreground"}`}>
            {invalid ? "API Key Invalid" : missing || noKey ? "API Key Required" : "Setup Required"}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {invalid
              ? "The server OpenRouter key is invalid or expired."
              : missing || noKey
                ? "Configure OPENROUTER_API_KEY to enable AI translations."
                : "Select a model in Settings to get started."}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            {keyReady ? null : (
              <button
                onClick={() => openApiKeyModal()}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Check API Key
              </button>
            )}
            <Link
              to="/settings"
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Open Settings
            </Link>
          </div>
        </div>
      </div>
    );
  }


  if (pageCount === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Analyze the document to get started with AI translations.
      </div>
    );
  }

  const doneCount = Object.values(aiSummary).filter((e) => e.status === "done").length;
  const modeLabel = MODE_INSTRUCTIONS[globals.mode]?.label || globals.mode;

  return (
    <div className="flex h-full flex-col">
      <ExplainSetupDialog
        open={explainSetupOpen}
        language={globals.language}
        style={globals.style as ExplanationStyle}
        onOpenChange={(open) => {
          setExplainSetupOpen(open);
          if (!open) setPendingExplainAction(null);
        }}
        onConfirm={handleExplainSetupConfirm}
      />
      {/* ─── Compact toolbar ─── */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {doneCount > 0 ? (
              <>{doneCount} of {pageCount} pages translated</>
            ) : (
              <>{pageCount} pages ready</>
            )}
          </span>
          {runAllProgress && (
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <span className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px] border-primary border-t-transparent spin-slow" />
              {runAllProgress.current}/{runAllProgress.total}
              {runAllProgress.errors > 0 && (
                <span className="text-destructive">· {runAllProgress.errors} failed</span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {runAllActive ? (
            <button
              onClick={cancelRunAll}
              className="rounded-lg border border-destructive/30 px-3 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={handleRunAll}
              className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
              title="Translate all pages"
            >
              ▶ Translate All
            </button>
          )}
        </div>
      </div>

      {/* ─── Single page card ─── */}
      <div className="flex-1 overflow-auto px-5 py-4 page-card-enter" key={activePage}>
        <PageCardLoader
          docId={docId}
          pageNumber={activePage}
          globals={globals}
          models={models}
          summary={aiSummary[activePage]}
          isRunning={runningPages.has(activePage)}
          streamBuf={streamBufs[activePage] ?? ""}
          onPageAiChange={onPageAiChange}
          onRun={() => runPageWithSetup(activePage)}
          onCancel={() => cancelPage(activePage)}
        />
      </div>
    </div>
  );
}

/* ---------- Per-page card loader (fetches its own data) ---------- */

interface CardLoaderProps {
  docId: string;
  pageNumber: number;
  globals: Globals;
  models: ORModel[];
  summary?: PageAiSummaryEntry;
  isRunning: boolean;
  streamBuf: string;
  onPageAiChange: (pageNumber: number, entry: PageAiSummaryEntry | null) => void;
  onRun: () => void;
  onCancel: () => void;
}

function PageCardLoader(props: CardLoaderProps) {
  const { docId, pageNumber, summary } = props;
  const [text, setText] = useState<string | null>(null);
  const [columns, setColumns] = useState(1);
  const [pageAi, setPageAi] = useState<PageAi>(() => ({
    pageNumber,
    status: summary?.status ?? "idle",
  }));

  // Fetch own data on mount / when key changes / when summary status flips to "done" elsewhere.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rec = await getPageData(docId, pageNumber);
      if (cancelled) return;
      if (rec) {
        setText(rec.text);
        setColumns(rec.columns);
        setPageAi(rec.pageAi ?? { pageNumber, status: "idle" });
      } else {
        setText("");
        setPageAi({ pageNumber, status: "idle" });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-fetch when summary transitions (status or hash change) so we get fresh result text after run.
  }, [docId, pageNumber, summary?.status, summary?.settingsHash, summary?.hasResult]);

  const handleUpdate = async (patch: Partial<PageAi>) => {
    setPageAi((prev) => ({ ...prev, ...patch, pageNumber }));
    await upsertPageAi(docId, pageNumber, patch);
    const rec = await getPageData(docId, pageNumber);
    if (rec?.pageAi) {
      props.onPageAiChange(pageNumber, summarize(rec.pageAi));
    }
  };

  if (text === null) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface/30 px-4 py-4 text-sm text-muted-foreground">
        <span className="inline-block h-3 w-3 rounded-full border-[1.5px] border-primary border-t-transparent spin-slow" />
        Loading page {pageNumber}…
      </div>
    );
  }

  return (
    <PageCard
      docId={docId}
      pageNumber={pageNumber}
      pageText={text}
      columns={columns}
      state={pageAi}
      eff={effective(props.globals, pageAi.overrides)}
      models={props.models}
      streamBuf={props.streamBuf}
      isRunning={props.isRunning}
      onUpdate={handleUpdate}
      onRun={props.onRun}
      onCancel={props.onCancel}
    />
  );
}

/* ---------- Card UI ---------- */

interface CardProps {
  docId: string;
  pageNumber: number;
  pageText: string;
  columns: number;
  state: PageAi;
  eff: ReturnType<typeof effective>;
  models: ORModel[];
  streamBuf: string;
  isRunning: boolean;
  onUpdate: (patch: Partial<PageAi>) => void;
  onRun: () => void;
  onCancel: () => void;
}

function PageCard({
  pageNumber,
  pageText,
  state,
  eff,
  models,
  streamBuf,
  isRunning,
  onUpdate,
  onRun,
  onCancel,
}: CardProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [editingJson, setEditingJson] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");
  const [ttsState, setTtsState] = useState<"idle" | "playing" | "paused" | "ended">("idle");
  const ttsRef = useRef<ReturnType<typeof createSmartTtsController> | null>(null);
  const [highlighted, setHighlighted] = useState(false);
  const [voiceSetupOpen, setVoiceSetupOpen] = useState(false);

  useEffect(() => {
    const handleScroll = (e: Event) => {
      const ev = e as CustomEvent<{ pageNumber: number }>;
      if (ev.detail?.pageNumber === pageNumber) {
        setHighlighted(true);
        const timer = setTimeout(() => setHighlighted(false), 1500);
        return () => clearTimeout(timer);
      }
    };
    window.addEventListener("doclens:scroll-to-workstation", handleScroll);
    return () => window.removeEventListener("doclens:scroll-to-workstation", handleScroll);
  }, [pageNumber]);

  // Strict cleanup on unmount: destroy TTS controller fully.
  useEffect(() => {
    return () => {
      ttsRef.current?.destroy();
      ttsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isRunning) {
      ttsRef.current?.stop();
      setTtsState("idle");
    }
  }, [isRunning]);

  const autoPayload = useMemo(() => {
    return buildPagePayload({
      modelId: eff.modelId,
      mode: eff.mode,
      language: eff.language,
      style: eff.style,
      temperature: eff.temperature,
      pageNumber,
      pageText,
    });
  }, [eff.modelId, eff.mode, eff.language, eff.style, eff.temperature, pageNumber, pageText]);

  const previewPayload = state.isCustom && state.customRequest ? state.customRequest : autoPayload;
  const overrideCount = state.overrides ? Object.keys(state.overrides).length : 0;

  const setOverride = (patch: Partial<PageOverrides>) => {
    onUpdate({ overrides: { ...(state.overrides ?? {}), ...patch } });
  };

  const startEdit = () => {
    setDraft(JSON.stringify(previewPayload, null, 2));
    setDraftError("");
    setEditingJson(true);
  };
  const saveEdit = () => {
    try {
      const parsed = JSON.parse(draft);
      if (typeof parsed !== "object" || !parsed) throw new Error("Not an object");
      onUpdate({ customRequest: parsed, isCustom: true });
      setEditingJson(false);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };
  const resetAuto = () => {
    onUpdate({ customRequest: null, isCustom: false });
    setEditingJson(false);
  };

  const startTts = () => {
    if (!state.result || !isTtsSupported()) return;
    if (ttsState === "paused" && ttsRef.current) {
      ttsRef.current.resume();
      return;
    }
    ttsRef.current?.destroy();
    const ctrl = createSmartTtsController(state.result, {
      onState: setTtsState,
      language: eff.language,
    });
    ttsRef.current = ctrl;
    ctrl.play();
  };

  const handleTtsPlay = () => {
    if (!state.result || !isTtsSupported()) return;
    if (ttsState === "paused" && ttsRef.current) {
      ttsRef.current.resume();
      return;
    }
    void hasTtsSelection(eff.language).then((ready) => {
      if (ready) startTts();
      else setVoiceSetupOpen(true);
    });
  };
  const handleTtsPause = () => ttsRef.current?.pause();
  const handleTtsStop = () => {
    ttsRef.current?.stop();
    setTtsState("idle");
  };

  /* Determine button label from mode */
  const modeLabel = MODE_INSTRUCTIONS[eff.mode]?.label || "Translate";
  const hasResult = !!state.result || isRunning;

  return (
    <article className={`reader-card ${highlighted ? "highlight-card" : ""} ${isRunning ? "!border-primary/20" : ""}`}>
      <TtsVoiceSetupDialog
        open={voiceSetupOpen}
        language={eff.language}
        onOpenChange={setVoiceSetupOpen}
        onReady={startTts}
      />
      {/* ─── Header ─── */}
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Page {pageNumber}
          </h3>
          {state.status === "done" && (
            <span className="flex h-1.5 w-1.5 rounded-full bg-primary" title="Translated" />
          )}
          {state.status === "running" && (
            <span className="inline-block h-3 w-3 rounded-full border-[1.5px] border-primary border-t-transparent spin-slow" />
          )}
          {state.status === "error" && (
            <span className="flex h-1.5 w-1.5 rounded-full bg-destructive" title="Error" />
          )}
          {state.isCustom && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">Custom</span>
          )}
          {overrideCount > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{overrideCount} override{overrideCount > 1 ? "s" : ""}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* TTS controls */}
          {state.result && isTtsSupported() && (
            <>
              {ttsState !== "playing" ? (
                <button
                  onClick={handleTtsPlay}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-primary"
                  title={ttsState === "paused" ? "Resume" : "Listen"}
                >
                  ▶
                </button>
              ) : (
                <button
                  onClick={handleTtsPause}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-primary transition-colors hover:bg-surface-2"
                  title="Pause"
                >
                  ❚❚
                </button>
              )}
              {(ttsState === "playing" || ttsState === "paused") && (
                <button
                  onClick={handleTtsStop}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-destructive"
                  title="Stop"
                >
                  ■
                </button>
              )}
            </>
          )}

          {/* Settings gear */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${showSettings ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`}
            title="Configure"
          >
            ⚙
          </button>

          {/* Run / Cancel */}
          {isRunning ? (
            <button
              onClick={onCancel}
              className="ml-1 rounded-lg border border-destructive/30 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={onRun}
              className="ml-1 rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              {modeLabel}
            </button>
          )}
        </div>
      </header>

      {/* ─── Error banner ─── */}
      {state.status === "error" && (
        <div className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {/* ─── Settings panel (collapsed by default) ─── */}
      <div className={`collapsible-content ${showSettings ? "open" : ""}`}>
        <div>
          <div className="mb-4 space-y-3 rounded-lg bg-surface-2/30 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Page Overrides</span>
              <div className="flex items-center gap-2">
                {state.isCustom && (
                  <button
                    onClick={resetAuto}
                    className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
                  >
                    Reset to Auto
                  </button>
                )}
                <button
                  onClick={editingJson ? () => setEditingJson(false) : startEdit}
                  className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {editingJson ? "Hide JSON" : "Edit JSON"}
                </button>
              </div>
            </div>

            <OverrideControls
              eff={eff}
              models={models}
              overrides={state.overrides}
              onSetOverride={setOverride}
              onClearOverrides={() => onUpdate({ overrides: undefined })}
              surface="primary"
            />

            {editingJson && (
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  className="h-56 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[12px] outline-none focus:border-primary"
                />
                {draftError && <div className="mt-1 text-xs text-destructive">{draftError}</div>}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={saveEdit}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingJson(false)}
                    className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Result / Streaming content ─── */}
      <div className="reader-text">
        {isRunning ? (
          <div className="whitespace-pre-wrap break-words">
            {streamBuf || (
              <span className="text-muted-foreground italic">Waiting for response…</span>
            )}
          </div>
        ) : state.result ? (
          <div className="whitespace-pre-wrap break-words">{state.result}</div>
        ) : (
          <p className="text-center text-sm text-muted-foreground py-8">
            Click <span className="font-semibold text-primary">{modeLabel}</span> to process this page.
          </p>
        )}
      </div>
    </article>
  );
}

function SmallSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-muted-foreground capitalize">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-background/50 px-2 py-1.5 text-[12px] text-foreground outline-none focus:border-primary"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

function OverrideControls({
  eff,
  models,
  overrides,
  onSetOverride,
  onClearOverrides,
}: {
  eff: ReturnType<typeof effective>;
  models: ORModel[];
  overrides?: PageOverrides;
  onSetOverride: (patch: Partial<PageOverrides>) => void;
  onClearOverrides: () => void;
  surface?: "primary";
}) {
  const hasOverrides = !!overrides && Object.keys(overrides).length > 0;

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <SmallSelect
          label="Mode"
          value={overrides?.mode ?? ""}
          onChange={(v) => onSetOverride({ mode: (v || undefined) as GlobalMode | undefined })}
          options={[
            ["", MODE_INSTRUCTIONS[eff.mode].label],
            ...Object.entries(MODE_INSTRUCTIONS).map(([k, v]) => [k, v.label] as [string, string]),
          ]}
        />
        <SmallSelect
          label="Language"
          value={overrides?.language ?? ""}
          onChange={(v) => onSetOverride({ language: v || undefined })}
          options={[["", eff.language], ...QUICK_LANGS.map((l) => [l, l] as [string, string])]}
        />
        <SmallSelect
          label="Style"
          value={overrides?.style ?? ""}
          onChange={(v) => onSetOverride({ style: v || undefined })}
          options={[["", eff.style], ...STYLES.map((s) => [s, s] as [string, string])]}
        />
        <SmallSelect
          label="Model"
          value={overrides?.modelId ?? ""}
          onChange={(v) => onSetOverride({ modelId: v || undefined })}
          options={[
            [
              "",
              (models.find((m) => m.id === eff.modelId)?.name ?? eff.modelId).slice(0, 32),
            ],
            ...models.slice(0, 80).map((m) => [m.id, (m.name ?? m.id).slice(0, 32)] as [string, string]),
          ]}
        />
        <label className="block">
          <span className="text-[11px] font-medium text-muted-foreground">
            Temperature · {(overrides?.temperature ?? eff.temperature).toFixed(2)}
          </span>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.05}
            value={overrides?.temperature ?? eff.temperature}
            onChange={(e) => onSetOverride({ temperature: parseFloat(e.target.value) })}
            className="mt-1 w-full accent-primary"
          />
        </label>
        <label className="flex items-center gap-2 self-end text-[12px] text-muted-foreground">
          <input
            type="checkbox"
            checked={overrides?.memory ?? eff.memory}
            onChange={(e) => onSetOverride({ memory: e.target.checked })}
            className="h-3.5 w-3.5 rounded accent-primary"
          />
          Memory
        </label>
      </div>
      {hasOverrides && (
        <button
          onClick={onClearOverrides}
          className="mt-2 rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Clear Overrides
        </button>
      )}
    </div>
  );
}
