/**
 * Piper TTS Engine — Full local neural TTS with HuggingFace voice catalog.
 *
 * Uses `piper-tts-web` (Poket-Jony) for WASM-based ONNX inference.
 * Voice catalog + models fetched from HuggingFace rhasspy/piper-voices.
 * Models cached in IndexedDB for offline use.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PiperVoiceMeta {
  key: string;          // e.g. "hi_IN-pratham-medium"
  name: string;         // e.g. "pratham"
  language: {
    code: string;       // e.g. "hi_IN"
    family: string;     // e.g. "hi"
    region: string;     // e.g. "IN"
    name_native: string;
    name_english: string;
    country_english: string;
  };
  quality: string;      // "x_low" | "low" | "medium" | "high"
  num_speakers: number;
  files: Record<string, { size_bytes: number; md5_digest: string }>;
  installed?: boolean;
  sizeBytes?: number;
}

export type EngineStatus = "idle" | "loading" | "ready" | "error";

// ─── Constants ─────────────────────────────────────────────────────────────

const VOICES_JSON_URL =
  "https://huggingface.co/rhasspy/piper-voices/raw/main/voices.json";
const HF_RESOLVE_BASE =
  "https://huggingface.co/rhasspy/piper-voices/resolve/main/";

const IDB_NAME = "doclens-piper";
const IDB_VERSION = 1;
const IDB_STORE = "models";

// ─── State ─────────────────────────────────────────────────────────────────

let catalogCache: PiperVoiceMeta[] | null = null;
let engineInstance: any = null; // PiperWebWorkerEngine
let engineStatus: EngineStatus = "idle";
const statusListeners = new Set<() => void>();

export function getStatus(): EngineStatus {
  return engineStatus;
}

export function onStatusChange(fn: () => void): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

function setStatus(s: EngineStatus) {
  engineStatus = s;
  statusListeners.forEach((fn) => fn());
}

// ─── IndexedDB helpers ─────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
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
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbAllKeys(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}

// ─── Voice Catalog ─────────────────────────────────────────────────────────

/** Fetch the full Piper voice catalog from HuggingFace. */
export async function fetchCatalog(): Promise<PiperVoiceMeta[]> {
  if (catalogCache) return catalogCache;

  const res = await fetch(VOICES_JSON_URL);
  if (!res.ok) throw new Error(`Failed to fetch voice catalog: ${res.status}`);
  const raw = (await res.json()) as Record<string, any>;
  const installed = new Set(await listInstalled());

  const voices: PiperVoiceMeta[] = Object.values(raw).map((v: any) => {
    // Sum the .onnx file size (skip .json and MODEL_CARD)
    let sizeBytes = 0;
    for (const [path, meta] of Object.entries(v.files ?? {})) {
      if (path.endsWith(".onnx")) sizeBytes = (meta as any).size_bytes;
    }
    return {
      key: v.key,
      name: v.name,
      language: v.language,
      quality: v.quality,
      num_speakers: v.num_speakers,
      files: v.files,
      installed: installed.has(v.key),
      sizeBytes,
    };
  });

  catalogCache = voices;
  return voices;
}

/** Invalidate cached catalog (e.g. after install/remove). */
export function invalidateCatalog() {
  catalogCache = null;
}

// ─── Model Management ──────────────────────────────────────────────────────

/** List installed voice IDs. */
export async function listInstalled(): Promise<string[]> {
  try {
    return await idbAllKeys();
  } catch {
    return [];
  }
}

/** Check if a voice is installed. */
export async function isInstalled(voiceId: string): Promise<boolean> {
  const data = await idbGet(voiceId);
  return data !== undefined;
}

/**
 * Download and install a Piper voice model from HuggingFace.
 * Stores the .onnx and .onnx.json in IndexedDB.
 */
export async function downloadVoice(
  voiceId: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  // Fetch catalog to get file paths
  const catalog = await fetchCatalog();
  const voice = catalog.find((v) => v.key === voiceId);
  if (!voice) throw new Error(`Voice "${voiceId}" not found in catalog`);

  // Find the .onnx and .onnx.json file paths
  let onnxPath = "";
  let configPath = "";
  for (const path of Object.keys(voice.files)) {
    if (path.endsWith(".onnx") && !path.endsWith(".onnx.json")) onnxPath = path;
    if (path.endsWith(".onnx.json")) configPath = path;
  }
  if (!onnxPath || !configPath) {
    throw new Error(`Invalid file paths for voice "${voiceId}"`);
  }

  // Download .onnx.json config (small)
  const configRes = await fetch(HF_RESOLVE_BASE + configPath);
  if (!configRes.ok) throw new Error(`Failed to fetch config: ${configRes.status}`);
  const config = await configRes.json();

  // Download .onnx model (large, with progress)
  const onnxRes = await fetch(HF_RESOLVE_BASE + onnxPath);
  if (!onnxRes.ok) throw new Error(`Failed to fetch model: ${onnxRes.status}`);

  const contentLength = Number(onnxRes.headers.get("content-length") || 0);
  const reader = onnxRes.body?.getReader();
  if (!reader) throw new Error("ReadableStream not supported");

  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, contentLength);
  }

  // Merge chunks
  const onnxData = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    onnxData.set(chunk, offset);
    offset += chunk.length;
  }

  // Store in IndexedDB
  await idbPut(voiceId, {
    onnx: onnxData.buffer,
    config,
    installedAt: Date.now(),
    language: voice.language.name_english,
    langCode: voice.language.code,
  });

  invalidateCatalog();
}

/** Remove an installed voice. */
export async function removeVoice(voiceId: string): Promise<void> {
  await idbDelete(voiceId);
  invalidateCatalog();
}

// ─── Engine / Synthesis ────────────────────────────────────────────────────

let currentAudio: HTMLAudioElement | null = null;

/**
 * Initialize the PiperWebWorkerEngine (lazy, once).
 * Uses piper-tts-web's PiperWebWorkerEngine which runs
 * ONNX + phonemize in Web Workers automatically.
 */
async function getEngine(): Promise<any> {
  if (engineInstance) return engineInstance;

  setStatus("loading");
  try {
    const { PiperWebWorkerEngine } = await import("piper-tts-web");
    engineInstance = new PiperWebWorkerEngine();
    setStatus("ready");
    return engineInstance;
  } catch (e) {
    console.error("[piper-engine] Failed to init:", e);
    setStatus("error");
    throw e;
  }
}

/**
 * Synthesize text using an installed Piper voice.
 * Returns an HTMLAudioElement that is already playing.
 */
export async function synthesize(
  text: string,
  voiceId: string,
  speakerId = 0,
): Promise<HTMLAudioElement> {
  const engine = await getEngine();

  // engine.generate returns { audio: Float32Array, sampleRate: number, phonemes: ... }
  const result = await engine.generate(text, voiceId, speakerId);

  // Encode audio to WAV
  const wav = encodeWav(result.audio, result.sampleRate);
  const blob = new Blob([wav], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);

  // Stop previous
  stop();

  const audio = new Audio(url);
  currentAudio = audio;
  audio.onended = () => {
    URL.revokeObjectURL(url);
    if (currentAudio === audio) currentAudio = null;
  };
  await audio.play();
  return audio;
}

/** Stop any current Piper playback. */
export function stop() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}

/**
 * Speak text in chunks (for long text), using an installed voice.
 * Resolves when all chunks finish or the AbortSignal fires.
 */
export async function speakChunked(
  text: string,
  voiceId: string,
  signal?: AbortSignal,
): Promise<void> {
  const chunks = splitIntoSentences(text);
  for (const chunk of chunks) {
    if (signal?.aborted) return;
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    const audio = await synthesize(trimmed, voiceId);
    await new Promise<void>((resolve) => {
      const cleanup = () => resolve();
      audio.onended = cleanup;
      audio.onerror = cleanup;
      signal?.addEventListener("abort", () => {
        stop();
        cleanup();
      }, { once: true });
    });
  }
}

/**
 * Pick the best installed voice for a language name.
 * Prefers medium quality, then low, then any.
 */
export async function pickVoiceForLanguage(
  lang: string,
): Promise<string | null> {
  // Check preferred voice first
  const preferred = localStorage.getItem("doclens.piper.preferredVoice");
  if (preferred) {
    if (await isInstalled(preferred)) return preferred;
  }

  const installed = await listInstalled();
  if (installed.length === 0) return null;

  // Get metadata for installed voices
  const catalog = await fetchCatalog();
  const installedVoices = catalog.filter((v) => installed.includes(v.key));

  // Normalize language for matching
  const langLower = lang.toLowerCase();

  // Try exact language match
  const langMatches = installedVoices.filter(
    (v) =>
      v.language.name_english.toLowerCase() === langLower ||
      v.language.name_native.toLowerCase() === langLower,
  );

  if (langMatches.length > 0) {
    // Prefer medium quality
    const medium = langMatches.find((v) => v.quality === "medium");
    if (medium) return medium.key;
    return langMatches[0].key;
  }

  // Fallback: return any installed voice
  return installed[0];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function splitIntoSentences(text: string): string[] {
  return text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
}

/** Encode Float32 PCM audio to WAV format. */
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * 2; // 16-bit = 2 bytes per sample

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // WAV header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);           // chunk size
  view.setUint16(20, 1, true);            // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Audio data: float32 → int16
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return buffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
