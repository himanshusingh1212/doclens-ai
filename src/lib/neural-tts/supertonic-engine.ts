/**
 * Supertonic TTS Engine — High-quality multilingual neural TTS.
 *
 * Uses Supertonic 3 (supertone-inc) with onnxruntime-web for in-browser
 * ONNX inference (WebGPU with WASM fallback). Models cached in IndexedDB.
 * Supports 31 languages with 10 voice styles (M1-M5, F1-F5).
 *
 * API surface mirrors piper-engine.ts for drop-in integration.
 */

import * as ort from "onnxruntime-web";

// Configure WASM backend to load binaries from CDN.
// Vite doesn't serve the .wasm files from node_modules automatically,
// so we point onnxruntime-web to the jsDelivr CDN for its WASM binaries.
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/";
import {
  type SupertonicConfig,
  type VoiceStyleData,
  type SupertonicLang,
  AVAILABLE_LANGS,
  isValidLang,
  loadVoiceStyle,
  loadTextToSpeech,
  type TextToSpeech,
  type Style,
} from "./supertonic-inference";

// ─── Types ─────────────────────────────────────────────────────────────────

export type EngineStatus = "idle" | "loading" | "ready" | "error";

export interface SupertonicVoiceStyle {
  id: string; // e.g. "M1", "F3"
  name: string; // e.g. "Male 1", "Female 3"
  gender: "male" | "female";
  installed: boolean;
}

export interface SynthesizedAudio {
  pcm: Float32Array;
  sampleRate: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const HF_BASE = "https://huggingface.co/Supertone/supertonic-3/resolve/main/";
const IDB_NAME = "doclens-supertonic";
const IDB_VERSION = 1;
const IDB_STORE = "assets";

const MODEL_FILES = [
  "onnx/duration_predictor.onnx",
  "onnx/text_encoder.onnx",
  "onnx/vector_estimator.onnx",
  "onnx/vocoder.onnx",
] as const;

const CONFIG_FILES = ["onnx/tts.json", "onnx/unicode_indexer.json"] as const;

const ALL_VOICE_STYLES: SupertonicVoiceStyle[] = [
  { id: "M1", name: "Male 1", gender: "male", installed: false },
  { id: "M2", name: "Male 2", gender: "male", installed: false },
  { id: "M3", name: "Male 3", gender: "male", installed: false },
  { id: "M4", name: "Male 4", gender: "male", installed: false },
  { id: "M5", name: "Male 5", gender: "male", installed: false },
  { id: "F1", name: "Female 1", gender: "female", installed: false },
  { id: "F2", name: "Female 2", gender: "female", installed: false },
  { id: "F3", name: "Female 3", gender: "female", installed: false },
  { id: "F4", name: "Female 4", gender: "female", installed: false },
  { id: "F5", name: "Female 5", gender: "female", installed: false },
];

/** Map language names → Supertonic lang codes */
const LANG_NAME_TO_CODE: Record<string, SupertonicLang> = {
  english: "en", korean: "ko", japanese: "ja", arabic: "ar",
  bulgarian: "bg", czech: "cs", danish: "da", german: "de",
  greek: "el", spanish: "es", estonian: "et", finnish: "fi",
  french: "fr", hindi: "hi", croatian: "hr", hungarian: "hu",
  indonesian: "id", italian: "it", lithuanian: "lt", latvian: "lv",
  dutch: "nl", polish: "pl", portuguese: "pt", romanian: "ro",
  russian: "ru", slovak: "sk", slovenian: "sl", swedish: "sv",
  turkish: "tr", ukrainian: "uk", vietnamese: "vi",
  हिंदी: "hi", বাংলা: "na", తెలుగు: "na", മലയാളം: "na",
};

const PREFERRED_STYLE_LS = "doclens.supertonic.preferredStyle";

// ─── State ─────────────────────────────────────────────────────────────────

let engineStatus: EngineStatus = "idle";
const statusListeners = new Set<() => void>();
let ttsInstance: TextToSpeech | null = null;
let ttsInitPromise: Promise<TextToSpeech> | null = null;
let currentStyle: Style | null = null;
let currentStyleId: string | null = null;
let audioCtx: AudioContext | null = null;
let activePipeline: { stop: () => void } | null = null;
let currentAudio: { audio: HTMLAudioElement; url: string } | null = null;

export function getStatus(): EngineStatus { return engineStatus; }
export function onStatusChange(fn: () => void) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}
function setStatus(s: EngineStatus) {
  engineStatus = s;
  statusListeners.forEach((fn) => fn());
}

// ─── IndexedDB ─────────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result as T | undefined); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function idbAllKeys(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).getAllKeys();
    req.onsuccess = () => { db.close(); resolve(req.result as string[]); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

// ─── Model Management ──────────────────────────────────────────────────────

/** Check if all 4 ONNX models + 2 config files are installed. */
export async function areModelsInstalled(): Promise<boolean> {
  try {
    const keys = new Set(await idbAllKeys());
    for (const f of MODEL_FILES) { if (!keys.has(f)) return false; }
    for (const f of CONFIG_FILES) { if (!keys.has(f)) return false; }
    return true;
  } catch { return false; }
}

/**
 * Download all ONNX models and config files from HuggingFace.
 * Progress callback reports (loaded bytes, total bytes).
 */
export async function downloadModels(
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  // Download config files first (small)
  for (const cf of CONFIG_FILES) {
    const res = await fetch(HF_BASE + cf);
    if (!res.ok) throw new Error(`Failed to fetch ${cf}: ${res.status}`);
    const data = await res.json();
    await idbPut(cf, data);
  }

  // Estimate total size (~411MB from HF API)
  const totalEstimate = 411_500_000;
  let totalLoaded = 0;

  for (const mf of MODEL_FILES) {
    const res = await fetch(HF_BASE + mf);
    if (!res.ok) throw new Error(`Failed to fetch ${mf}: ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error("ReadableStream not supported");

    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLoaded += value.length;
      onProgress?.(totalLoaded, totalEstimate);
    }

    const blob = new Blob(chunks as BlobPart[], { type: "application/octet-stream" });
    chunks.length = 0; // free references
    await idbPut(mf, blob);
  }
}

/** Remove all installed models and configs. */
export async function removeModels(): Promise<void> {
  destroyEngine();
  for (const f of MODEL_FILES) await idbDelete(f).catch(() => {});
  for (const f of CONFIG_FILES) await idbDelete(f).catch(() => {});
  // Also remove voice styles
  for (const vs of ALL_VOICE_STYLES) await idbDelete(`voice_styles/${vs.id}.json`).catch(() => {});
}

// ─── Voice Styles ──────────────────────────────────────────────────────────

/** List all 10 voice styles with installation status. */
export async function listVoiceStyles(): Promise<SupertonicVoiceStyle[]> {
  const keys = new Set(await idbAllKeys().catch(() => [] as string[]));
  return ALL_VOICE_STYLES.map((vs) => ({
    ...vs,
    installed: keys.has(`voice_styles/${vs.id}.json`),
  }));
}

/** Download a voice style JSON from HuggingFace (~few KB each). */
export async function downloadVoiceStyle(styleId: string): Promise<void> {
  const res = await fetch(`${HF_BASE}voice_styles/${styleId}.json`);
  if (!res.ok) throw new Error(`Failed to fetch voice style ${styleId}: ${res.status}`);
  const data = await res.json();
  await idbPut(`voice_styles/${styleId}.json`, data);
}

/** Remove a cached voice style. */
export async function removeVoiceStyle(styleId: string): Promise<void> {
  await idbDelete(`voice_styles/${styleId}.json`);
  if (currentStyleId === styleId) {
    currentStyle = null;
    currentStyleId = null;
  }
}

/** Get preferred voice style from localStorage. */
export function getPreferredStyle(): string {
  return typeof window !== "undefined"
    ? localStorage.getItem(PREFERRED_STYLE_LS) ?? "M1"
    : "M1";
}

/** Set preferred voice style. */
export function setPreferredStyle(styleId: string) {
  localStorage.setItem(PREFERRED_STYLE_LS, styleId);
}

// ─── Engine Initialization ─────────────────────────────────────────────────

async function loadStyle(styleId: string): Promise<Style> {
  if (currentStyleId === styleId && currentStyle) return currentStyle;

  let data = await idbGet<VoiceStyleData>(`voice_styles/${styleId}.json`);
  if (!data) {
    // Auto-download if not cached
    await downloadVoiceStyle(styleId);
    data = await idbGet<VoiceStyleData>(`voice_styles/${styleId}.json`);
    if (!data) throw new Error(`Voice style "${styleId}" not found after download`);
  }

  currentStyle = await loadVoiceStyle(data);
  currentStyleId = styleId;
  return currentStyle;
}

async function getTTS(): Promise<TextToSpeech> {
  if (ttsInstance) return ttsInstance;
  if (ttsInitPromise) return ttsInitPromise;

  ttsInitPromise = (async () => {
    setStatus("loading");
    try {
      if (!(await areModelsInstalled())) {
        throw new Error("Supertonic models not installed. Go to Settings → Voice to install.");
      }

      const cfgs = (await idbGet<SupertonicConfig>("onnx/tts.json"))!;
      const indexer = (await idbGet<number[]>("onnx/unicode_indexer.json"))!;

      // Determine execution providers
      const sessionOptions: ort.InferenceSession.SessionOptions = {
        executionProviders: ["wasm"],
      };

      // Try WebGPU first if available
      try {
        if (typeof navigator !== "undefined" && "gpu" in navigator) {
          const adapter = await (navigator as any).gpu?.requestAdapter();
          if (adapter) {
            sessionOptions.executionProviders = ["webgpu", "wasm"];
          }
        }
      } catch {
        // WebGPU not available, fall back to WASM
      }

      // Load ONNX sessions from IndexedDB blobs
      const loadSession = async (key: string) => {
        const blob = await idbGet<Blob>(key);
        if (!blob) throw new Error(`Model file "${key}" not found in IndexedDB`);
        const arrayBuffer = await (blob instanceof Blob ? blob.arrayBuffer() : Promise.resolve(blob as ArrayBuffer));
        return ort.InferenceSession.create(arrayBuffer, sessionOptions);
      };

      const [dp, textEnc, vectorEst, vocoder] = await Promise.all([
        loadSession("onnx/duration_predictor.onnx"),
        loadSession("onnx/text_encoder.onnx"),
        loadSession("onnx/vector_estimator.onnx"),
        loadSession("onnx/vocoder.onnx"),
      ]);

      ttsInstance = await loadTextToSpeech(cfgs, indexer, { dp, textEnc, vectorEst, vocoder });
      setStatus("ready");
      return ttsInstance;
    } catch (e) {
      console.error("[supertonic-engine] Failed to init:", e);
      setStatus("error");
      ttsInitPromise = null;
      throw e;
    }
  })();

  return ttsInitPromise;
}

// ─── Synthesis ─────────────────────────────────────────────────────────────

/**
 * Synthesize text to PCM audio data.
 */
export async function synthesizeAudio(
  text: string,
  lang: string,
  styleId?: string,
  opts?: { speed?: number; totalStep?: number },
): Promise<SynthesizedAudio> {
  const tts = await getTTS();
  const sId = styleId || getPreferredStyle();
  const style = await loadStyle(sId);
  const langCode = resolveLangCode(lang);
  const speed = opts?.speed ?? 1.05;
  const totalStep = opts?.totalStep ?? 8;

  const { wav } = await tts.synthesize(text, langCode, style, totalStep, speed);
  return { pcm: new Float32Array(wav), sampleRate: tts.sampleRate };
}

/** Resolve a language name or code to a Supertonic lang code. */
export function resolveLangCode(lang: string): SupertonicLang {
  const lower = lang.toLowerCase().trim();
  if (isValidLang(lower)) return lower as SupertonicLang;
  const mapped = LANG_NAME_TO_CODE[lower];
  if (mapped) return mapped;
  // Try extracting first 2 chars as a code
  const code = lower.split(/[-_]/)[0];
  if (isValidLang(code)) return code as SupertonicLang;
  return "na"; // language-agnostic fallback
}

/** Check if a language is natively supported (not just fallback). */
export function isLanguageSupported(lang: string): boolean {
  const code = resolveLangCode(lang);
  return code !== "na";
}

// ─── Playback ──────────────────────────────────────────────────────────────

function getAudioCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === "closed") {
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
    audioCtx = new Ctor({ sampleRate: 44100 });
  }
  return audioCtx!;
}

function closeAudioContext() {
  if (audioCtx && audioCtx.state !== "closed") {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
}

function stopAudioContextPlayback() {
  if (activePipeline) {
    activePipeline.stop();
    activePipeline = null;
  }
}

/** Stop any current playback. */
export function stop() {
  if (currentAudio) {
    currentAudio.audio.pause();
    URL.revokeObjectURL(currentAudio.url);
    try { currentAudio.audio.removeAttribute("src"); currentAudio.audio.load(); } catch { /* ignore */ }
    currentAudio = null;
  }
  stopAudioContextPlayback();
  closeAudioContext();
}

/** Quick test: synthesize a sample and play it. */
export async function testVoice(styleId: string, lang = "en"): Promise<void> {
  const sampleTexts: Record<string, string> = {
    en: "Hello! This is a test of the Supertonic neural text-to-speech engine.",
    hi: "नमस्ते! यह सुपरटोनिक न्यूरल टेक्स्ट-टू-स्पीच इंजन का परीक्षण है।",
    ko: "안녕하세요! 수퍼토닉 신경 텍스트 음성 변환 엔진 테스트입니다.",
    ja: "こんにちは！スーパートニック音声合成エンジンのテストです。",
    fr: "Bonjour! Ceci est un test du moteur Supertonic.",
    de: "Hallo! Dies ist ein Test der Supertonic Sprachsynthese.",
    es: "¡Hola! Esta es una prueba del motor Supertonic.",
  };
  const text = sampleTexts[lang] || sampleTexts.en;
  const audio = await synthesizeAudio(text, lang, styleId);
  stop();

  const ctx = getAudioCtx();
  await ctx.resume();
  const buffer = ctx.createBuffer(1, audio.pcm.length, audio.sampleRate);
  buffer.getChannelData(0).set(audio.pcm);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.start();

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => { try { src.stop(); } catch {} resolve(); }, 30_000);
    src.onended = () => { clearTimeout(timeout); resolve(); };
  });
  destroyEngine();
}

/**
 * Speak text gaplessly using a 2-deep pre-render pipeline.
 * Same architecture as piper-engine.ts speakChunked.
 */
export async function speakChunked(
  text: string,
  lang: string,
  styleId: string,
  signal?: AbortSignal,
): Promise<void> {
  const chunks = splitIntoSentences(text).map((c) => c.trim()).filter(Boolean);
  if (chunks.length === 0) return;

  stop();
  const ctx = getAudioCtx();

  if (ctx.state === "suspended") {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await ctx.resume(); if ((ctx.state as string) === "running") break; } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    if ((ctx.state as string) !== "running") {
      closeAudioContext();
      const freshCtx = getAudioCtx();
      try { await freshCtx.resume(); } catch {}
    }
  }

  const MAX_BUFFERED = 2;
  let aborted = false;
  const sources = new Set<AudioBufferSourceNode>();
  const decoded: AudioBuffer[] = [];
  let prefetchIndex = 0;
  let resolveSlot: (() => void) | null = null;
  let resolveBuffer: (() => void) | null = null;
  const activeCtx = audioCtx!;
  const langCode = resolveLangCode(lang);

  const waitForSlot = () => new Promise<void>((res) => {
    if (decoded.length < MAX_BUFFERED || aborted) { res(); return; }
    resolveSlot = res;
  });
  const notifySlot = () => { if (resolveSlot) { const r = resolveSlot; resolveSlot = null; r(); } };
  const notifyConsumer = () => { if (resolveBuffer) { const r = resolveBuffer; resolveBuffer = null; r(); } };
  const waitForBuffer = () => new Promise<void>((res) => {
    if (decoded.length > 0 || prefetchIndex >= chunks.length || aborted) { res(); return; }
    resolveBuffer = res;
  });

  // Producer
  const producer = (async () => {
    while (prefetchIndex < chunks.length && !aborted) {
      await waitForSlot();
      if (aborted) return;
      try {
        const audioData = await synthesizeAudio(chunks[prefetchIndex], langCode, styleId);
        if (aborted) return;
        const buffer = activeCtx.createBuffer(1, audioData.pcm.length, audioData.sampleRate);
        buffer.getChannelData(0).set(audioData.pcm);
        decoded.push(buffer);
        prefetchIndex++;
        notifyConsumer();
      } catch (e) {
        if (aborted) return;
        console.warn("[supertonic-engine] Chunk", prefetchIndex, "failed:", e);
        prefetchIndex++;
      }
    }
  })();

  let nextStartTime = activeCtx.currentTime;
  let playedCount = 0;

  activePipeline = {
    stop: () => {
      aborted = true;
      for (const s of sources) {
        try { s.stop(); } catch {}
        try { (s as any).buffer = null; } catch {}
        try { s.disconnect(); } catch {}
      }
      sources.clear();
      decoded.length = 0;
      notifySlot();
      notifyConsumer();
    },
  };

  const onAbort = () => activePipeline?.stop();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    while (playedCount < chunks.length && !aborted) {
      if (decoded.length === 0) {
        if (prefetchIndex >= chunks.length) break;
        await waitForBuffer();
        if (aborted) break;
        if (decoded.length === 0) continue;
      }

      const buffer = decoded.shift()!;
      notifySlot();

      const src = activeCtx.createBufferSource();
      src.buffer = buffer;
      src.connect(activeCtx.destination);
      const startAt = Math.max(nextStartTime, activeCtx.currentTime);
      src.start(startAt);
      nextStartTime = startAt + buffer.duration;
      sources.add(src);

      src.onended = () => {
        sources.delete(src);
        try { (src as any).buffer = null; } catch {}
        try { src.disconnect(); } catch {}
      };

      playedCount++;
      const waitMs = Math.max(0, (nextStartTime - activeCtx.currentTime) * 1000 - 50);
      if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    }

    if (!aborted) {
      const tail = Math.max(0, (nextStartTime - activeCtx.currentTime) * 1000);
      if (tail > 0) await new Promise((r) => setTimeout(r, tail));
    }
    await producer.catch(() => {});
  } finally {
    signal?.removeEventListener("abort", onAbort);
    if (activePipeline) activePipeline = null;
    closeAudioContext();
  }
}

// ─── Language picker ───────────────────────────────────────────────────────

/**
 * Pick the best voice configuration for a language.
 * Returns null if models aren't installed.
 */
export async function pickVoiceForLanguage(
  lang: string,
): Promise<{ lang: SupertonicLang; style: string } | null> {
  if (!(await areModelsInstalled())) return null;
  const langCode = resolveLangCode(lang);
  const styleId = getPreferredStyle();
  return { lang: langCode, style: styleId };
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────

/** Tear down engine to reclaim memory. Re-initializes lazily on next use. */
export function destroyEngine() {
  stop();
  closeAudioContext();
  currentStyle = null;
  currentStyleId = null;
  ttsInstance = null;
  ttsInitPromise = null;
  setStatus("idle");
}

/** List of supported languages for UI display. */
export function getSupportedLanguages(): { code: SupertonicLang; name: string }[] {
  return [
    { code: "en", name: "English" }, { code: "ko", name: "Korean" },
    { code: "ja", name: "Japanese" }, { code: "ar", name: "Arabic" },
    { code: "bg", name: "Bulgarian" }, { code: "cs", name: "Czech" },
    { code: "da", name: "Danish" }, { code: "de", name: "German" },
    { code: "el", name: "Greek" }, { code: "es", name: "Spanish" },
    { code: "et", name: "Estonian" }, { code: "fi", name: "Finnish" },
    { code: "fr", name: "French" }, { code: "hi", name: "Hindi" },
    { code: "hr", name: "Croatian" }, { code: "hu", name: "Hungarian" },
    { code: "id", name: "Indonesian" }, { code: "it", name: "Italian" },
    { code: "lt", name: "Lithuanian" }, { code: "lv", name: "Latvian" },
    { code: "nl", name: "Dutch" }, { code: "pl", name: "Polish" },
    { code: "pt", name: "Portuguese" }, { code: "ro", name: "Romanian" },
    { code: "ru", name: "Russian" }, { code: "sk", name: "Slovak" },
    { code: "sl", name: "Slovenian" }, { code: "sv", name: "Swedish" },
    { code: "tr", name: "Turkish" }, { code: "uk", name: "Ukrainian" },
    { code: "vi", name: "Vietnamese" },
  ];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function splitIntoSentences(text: string): string[] {
  return text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
}

// Vite HMR cleanup
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try { destroyEngine(); } catch (e) {
      console.warn("[HMR] Failed to dispose Supertonic engine:", e);
    }
  });
}
