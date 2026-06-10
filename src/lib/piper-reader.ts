import { getTtsRate } from "@/lib/tts";

type PiperEngineModule = typeof import("@/lib/neural-tts/piper-engine");

export type ReaderStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

export interface ReaderSnapshot {
  status: ReaderStatus;
  chunks: string[];
  index: number;
  bufferedUntil: number;
  error?: string;
  canForward: boolean;
  canRewind: boolean;
  paragraphs?: {
    chunks: {
      text: string;
      index: number;
    }[];
  }[];
}

export interface PiperReaderController {
  play(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  destroy(): void;
  seek(index: number): void;
  forward(): void;
  rewind(): void;
  setPlaybackRate(rate: number): void;
  getSnapshot(): ReaderSnapshot;
}

interface AudioEntry {
  buffer: AudioBuffer;
}

interface Options {
  language?: string | null;
  onSnapshot?: (snapshot: ReaderSnapshot) => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

const MAX_CACHE_ENTRIES = 12;
const MAX_READY_BUFFERS = 5;
const SCHEDULE_AHEAD_SECONDS = 0.03;
/** Piper outputs 22050 Hz mono. Match the AudioContext rate so the browser
 *  doesn't resample every buffer on the audio thread. */
const PIPER_SAMPLE_RATE = 22050;

let activeController: PiperReader | null = null;
let enginePromise: Promise<PiperEngineModule> | null = null;

const globalCache = new Map<string, Promise<AudioEntry>>();
const globalCacheLru = new Map<string, number>();

export function createPiperReaderController(
  text: string,
  options: Options = {},
): PiperReaderController {
  activeController?.destroy();
  const controller = new PiperReader(text, options);
  activeController = controller;
  return controller;
}

export function stopPiperReader() {
  activeController?.stop();
}

export function setPiperReaderPlaybackRate(rate: number) {
  activeController?.setPlaybackRate(rate);
}

export async function prefetchTts(text: string, language: string) {
  try {
    const { chunks } = chunkTextWithParagraphs(text);
    if (!chunks.length) return;
    const engine = await loadPiperEngine();
    const voiceId = await engine.pickVoiceForLanguage(language);
    if (!voiceId) return;

    // Prefetch first 2 chunks
    const count = Math.min(chunks.length, 2);
    for (let i = 0; i < count; i++) {
      const chunkText = chunks[i];
      const key = `${voiceId}:${chunkText}`;
      if (!globalCache.has(key)) {
        const promise = (async () => {
          const audioData = await engine.synthesizeAudio(chunkText, voiceId);
          const Ctor = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new Ctor({ sampleRate: PIPER_SAMPLE_RATE });
          let buffer: AudioBuffer;
          if (audioData.pcm) {
            buffer = ctx.createBuffer(1, audioData.pcm.length, audioData.sampleRate ?? 22050);
            buffer.getChannelData(0).set(audioData.pcm);
          } else if (audioData.blob) {
            const arrayBuffer = await audioData.blob.arrayBuffer();
            const copy = new ArrayBuffer(arrayBuffer.byteLength);
            new Uint8Array(copy).set(new Uint8Array(arrayBuffer));
            buffer = await ctx.decodeAudioData(copy);
          } else {
            throw new Error("No audio data");
          }
          ctx.close().catch(() => {});
          return { buffer };
        })();
        globalCache.set(key, promise);
        globalCacheLru.set(key, performance.now());
      }
    }
  } catch (e) {
    console.warn("TTS Prefetch failed:", e);
  }
}

function loadPiperEngine(): Promise<PiperEngineModule> {
  if (!enginePromise) enginePromise = import("@/lib/neural-tts/piper-engine");
  return enginePromise;
}

class PiperReader implements PiperReaderController {
  private text: string;
  private chunks: string[];
  private paragraphs: { chunks: { text: string; index: number }[] }[] = [];
  private status: ReaderStatus = "idle";
  private index = 0;
  private bufferedUntil = -1;
  private audioCtx: AudioContext | null = null;
  private voiceId: string | null = null;
  private generationToken = 0;
  private playToken = 0;
  private destroyed = false;
  private paused = false;
  private source: AudioBufferSourceNode | null = null;
  private currentStartedAt = 0;
  private currentOffset = 0;
  private currentRate = 1;
  private currentBuffer: AudioBuffer | null = null;
  private sourceDone: (() => void) | null = null;
  private slotWaiter: (() => void) | null = null;

  constructor(
    text: string,
    private options: Options,
  ) {
    this.text = typeof text === "string" ? text : "";
    const { chunks, paragraphs } = chunkTextWithParagraphs(this.text);
    this.chunks = chunks;
    this.paragraphs = paragraphs;
    this.emit();
  }

  play() {
    if (this.destroyed) return;
    if (this.chunks.length === 0) {
      const message = "There is no text to read on this page.";
      this.status = "error";
      this.options.onError?.(message);
      this.emit(message);
      return;
    }
    if (this.status === "paused") {
      this.resume();
      return;
    }
    if (this.status === "playing" || this.status === "loading") return;
    if (this.status === "ended" || this.status === "error") this.index = 0;
    void this.startAt(this.index);
  }

  pause() {
    if (this.status !== "playing" || !this.audioCtx) return;
    this.paused = true;
    this.status = "paused";
    if (this.source) {
      this.currentOffset +=
        Math.max(0, this.audioCtx.currentTime - this.currentStartedAt) * this.currentRate;
      this.stopSource();
    }
    void this.audioCtx.suspend().catch(() => {});
    this.emit();
  }

  resume() {
    if (this.status !== "paused" || this.destroyed) return;
    this.paused = false;
    void this.audioCtx?.resume().catch(() => {});
    void this.playCurrentFromOffset();
  }

  stop() {
    if (this.status === "idle" && !this.audioCtx) return;
    this.playToken++;
    this.generationToken++;
    this.paused = false;
    this.stopSource();
    this.closeAudioContext();
    this.index = 0;
    this.currentOffset = 0;
    this.currentBuffer = null;
    this.bufferedUntil = -1;
    this.status = "idle";
    this.emit();
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    this.notifySlot();
    if (activeController === this) activeController = null;
  }

  setPlaybackRate(rate: number) {
    if (this.audioCtx && this.source) {
      const elapsed = Math.max(0, this.audioCtx.currentTime - this.currentStartedAt);
      this.currentOffset += elapsed * this.currentRate;
      this.currentStartedAt = this.audioCtx.currentTime;
    }
    this.currentRate = rate;
    if (this.source) {
      this.source.playbackRate.value = rate;
    }
  }

  seek(index: number) {
    if (!Number.isFinite(index) || index < 0 || index >= this.chunks.length) return;
    this.index = index;
    this.currentOffset = 0;
    const wasActive =
      this.status === "playing" || this.status === "paused" || this.status === "loading";
    this.stopSource();
    this.emit();
    if (wasActive) void this.startAt(index);
  }

  forward() {
    if (this.index + 1 < this.chunks.length) this.seek(this.index + 1);
  }

  rewind() {
    if (!this.audioCtx || this.audioCtx.currentTime - this.currentStartedAt < 3) {
      if (this.index > 0) this.seek(this.index - 1);
      else this.seek(0);
    } else {
      this.seek(this.index);
    }
  }

  getSnapshot(): ReaderSnapshot {
    return {
      status: this.status,
      chunks: this.chunks,
      index: this.index,
      bufferedUntil: this.bufferedUntil,
      error: undefined,
      canForward: this.index + 1 < this.chunks.length,
      canRewind: this.index > 0 || this.currentOffset > 0,
      paragraphs: this.paragraphs,
    };
  }

  private async startAt(index: number) {
    const token = ++this.playToken;
    this.index = index;
    this.currentOffset = 0;
    this.currentBuffer = null;
    this.paused = false;
    this.status = "loading";
    this.emit();

    try {
      const engine = await loadPiperEngine();
      this.voiceId = await engine.pickVoiceForLanguage(this.options.language || "English");
      if (!this.voiceId) throw new Error("No installed Piper voice found for this language.");
      const ctx = this.ensureAudioContext();
      await ctx.resume();
      this.startProducer(index, token);
      await this.playLoop(token);
    } catch (e) {
      if (this.destroyed || token !== this.playToken) return;
      const message = e instanceof Error ? e.message : "Piper playback failed.";
      this.status = "error";
      this.options.onError?.(message);
      this.emit(message);
    }
  }

  private startProducer(startIndex: number, playToken: number) {
    const token = ++this.generationToken;
    void (async () => {
      for (let i = startIndex; i < this.chunks.length; i++) {
        if (this.destroyed || token !== this.generationToken || playToken !== this.playToken)
          return;
        // Wait for the play loop to consume a slot, signalled via a promise.
        // Replaces the previous busy-poll (delay(40)) which woke 25× per
        // second per active reader for no useful work.
        while (
          this.bufferedUntil - this.index >= MAX_READY_BUFFERS &&
          !this.destroyed &&
          token === this.generationToken &&
          playToken === this.playToken
        ) {
          await new Promise<void>((res) => {
            this.slotWaiter = res;
          });
        }
        if (this.destroyed || token !== this.generationToken || playToken !== this.playToken)
          return;
        await this.fetchAudio(i).catch(() => null);
        this.bufferedUntil = Math.max(this.bufferedUntil, i);
        this.emit();
      }
    })();
  }

  private notifySlot() {
    if (this.slotWaiter) {
      const r = this.slotWaiter;
      this.slotWaiter = null;
      r();
    }
  }

  private async playLoop(token: number) {
    while (!this.destroyed && token === this.playToken && this.index < this.chunks.length) {
      if (this.paused) {
        await delay(50);
        continue;
      }
      await this.playCurrentFromOffset(token);
      if (this.destroyed || token !== this.playToken || this.paused) return;
      this.index++;
      this.currentOffset = 0;
      this.currentBuffer = null;
      // Producer is bounded by (bufferedUntil - index); now that index
      // advanced, the producer's slot wait can resolve.
      this.notifySlot();
    }
    if (!this.destroyed && token === this.playToken) {
      this.status = "ended";
      this.options.onEnd?.();
      this.emit();
    }
  }

  private async playCurrentFromOffset(token = this.playToken) {
    const ctx = this.ensureAudioContext();
    this.status = this.currentOffset > 0 ? "playing" : "loading";
    this.emit();
    const entry = this.currentBuffer
      ? { buffer: this.currentBuffer }
      : await this.fetchAudio(this.index);
    if (this.destroyed || token !== this.playToken || this.paused) return;
    this.currentBuffer = entry.buffer;
    if (this.currentOffset >= entry.buffer.duration - 0.01) {
      this.currentOffset = entry.buffer.duration;
      return;
    }
    this.status = "playing";
    this.emit();

    const source = ctx.createBufferSource();
    source.buffer = entry.buffer;
    this.currentRate = getTtsRate();
    source.playbackRate.value = this.currentRate;
    source.connect(ctx.destination);
    this.source = source;

    const startAt = Math.max(ctx.currentTime + SCHEDULE_AHEAD_SECONDS, ctx.currentTime);
    this.currentStartedAt = startAt;
    const done = new Promise<void>((resolve) => {
      this.sourceDone = resolve;
      source.onended = () => resolve();
    });
    source.start(startAt, this.currentOffset);
    await done;
    if (this.sourceDone) this.sourceDone = null;
    if (this.source === source) this.source = null;
    if (this.status === "playing") this.currentOffset = entry.buffer.duration;
  }

  private async fetchAudio(index: number): Promise<AudioEntry> {
    const text = this.chunks[index];
    const key = `${this.voiceId}:${text}`;
    let promise = globalCache.get(key);
    if (!promise) {
      promise = this.generateAudio(text);
      globalCache.set(key, promise);
    }
    // True LRU: touch on every access, evict the oldest entry that is NOT
    // the currently-playing or next-up chunk (so seek-back can find buffers
    // and the play head never stalls on a freshly-evicted entry).
    globalCacheLru.set(key, performance.now());
    if (globalCache.size > MAX_CACHE_ENTRIES) {
      const currentKey = `${this.voiceId}:${this.chunks[this.index]}`;
      const nextKey = `${this.voiceId}:${this.chunks[this.index + 1] ?? ""}`;
      const sorted = [...globalCacheLru.entries()].sort((a, b) => a[1] - b[1]);
      for (const [oldKey] of sorted) {
        if (globalCache.size <= MAX_CACHE_ENTRIES) break;
        if (oldKey === currentKey || oldKey === nextKey || oldKey === key) continue;
        globalCache.delete(oldKey);
        globalCacheLru.delete(oldKey);
      }
    }
    return promise;
  }

  private async generateAudio(text: string): Promise<AudioEntry> {
    if (!this.voiceId) throw new Error("Piper voice is not ready.");
    const engine = await loadPiperEngine();
    const audioData = await engine.synthesizeAudio(text, this.voiceId);
    const ctx = this.ensureAudioContext();
    let buffer: AudioBuffer;
    if (audioData.pcm) {
      buffer = ctx.createBuffer(1, audioData.pcm.length, audioData.sampleRate ?? 22050);
      buffer.getChannelData(0).set(audioData.pcm);
    } else if (audioData.blob) {
      const arrayBuffer = await audioData.blob.arrayBuffer();
      buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    } else {
      throw new Error("Piper returned no audio.");
    }
    return { buffer };
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === "closed") {
      const Ctor =
        window.AudioContext ||
        (
          window as Window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
      // Match Piper's native sample rate to avoid browser-side resampling
      // (which silently doubles CPU on the audio thread on most laptops).
      try {
        this.audioCtx = new Ctor({ sampleRate: PIPER_SAMPLE_RATE });
      } catch {
        // Safari < 14 rejects the constructor option — fall back to default.
        this.audioCtx = new Ctor();
      }
    }
    return this.audioCtx;
  }

  private stopSource() {
    if (!this.source) return;
    const source = this.source;
    this.source = null;
    source.onended = null;
    const done = this.sourceDone;
    this.sourceDone = null;
    try {
      source.stop();
    } catch {
      /* ignore */
    }
    try {
      source.disconnect();
    } catch {
      /* ignore */
    }
    done?.();
  }

  private closeAudioContext() {
    if (this.audioCtx && this.audioCtx.state !== "closed") {
      this.audioCtx.close().catch(() => {});
    }
    this.audioCtx = null;
  }

  private emit(error?: string) {
    this.options.onSnapshot?.({
      ...this.getSnapshot(),
      error,
    });
  }
}

function chunkTextWithParagraphs(text: string | null | undefined): {
  chunks: string[];
  paragraphs: { chunks: { text: string; index: number }[] }[];
} {
  const rawText = text ?? "";
  const paragraphTexts = rawText.split(/\r?\n\r?\n+/);

  const chunks: string[] = [];
  const paragraphs: { chunks: { text: string; index: number }[] }[] = [];

  let globalIndex = 0;
  for (const pText of paragraphTexts) {
    const trimmedP = pText.trim();
    if (!trimmedP) continue;

    const pChunks = chunkParagraphForReading(trimmedP);
    const pChunksWithIndex = pChunks.map((chunkText) => {
      chunks.push(chunkText);
      const index = globalIndex;
      globalIndex++;
      return { text: chunkText, index };
    });

    if (pChunksWithIndex.length > 0) {
      paragraphs.push({ chunks: pChunksWithIndex });
    }
  }

  return { chunks, paragraphs };
}

function chunkParagraphForReading(paragraphText: string): string[] {
  const cleaned = paragraphText.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const isEastAsian = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(cleaned);
  const punctuator = isEastAsian ? new EastAsianPunctuator() : new LatinPunctuator();
  return new CharBreaker(420, punctuator, 220)
    .breakText(cleaned)
    .map((chunk) => {
      const trimmed = chunk.trim();
      return /[\w)]$/.test(trimmed) ? `${trimmed}.` : trimmed;
    })
    .filter(Boolean);
}

function chunkForReading(text: string | null | undefined): string[] {
  return chunkTextWithParagraphs(text).chunks;
}

class CharBreaker {
  constructor(
    private charLimit: number,
    private punctuator: Punctuator,
    private combineThreshold = charLimit,
  ) {}

  breakText(text: string): string[] {
    return this.merge(
      this.punctuator.getParagraphs(text),
      (p) => this.breakParagraph(p),
      this.combineThreshold,
    );
  }

  private breakParagraph(text: string): string[] {
    return this.merge(this.punctuator.getSentences(text), (s) => this.breakSentence(s));
  }

  private breakSentence(text: string): string[] {
    return this.merge(this.punctuator.getPhrases(text), (p) => this.breakPhrase(p));
  }

  private breakPhrase(text: string): string[] {
    return this.merge(this.punctuator.getWords(text), (w) => this.breakWord(w));
  }

  private breakWord(text: string): string[] {
    const out: string[] = [];
    for (let i = 0; i < text.length; i += this.charLimit)
      out.push(text.slice(i, i + this.charLimit));
    return out;
  }

  private merge(
    parts: string[],
    breakPart: (part: string) => string[],
    limit = this.charLimit,
  ): string[] {
    const result: string[] = [];
    let group = "";
    for (const part of parts) {
      if (part.length > this.charLimit) {
        if (group) result.push(group);
        group = "";
        result.push(...breakPart(part));
      } else if (group.length + part.length > limit) {
        if (group) result.push(group);
        group = part;
      } else {
        group += part;
      }
    }
    if (group) result.push(group);
    return result;
  }
}

interface Punctuator {
  getParagraphs(text: string): string[];
  getSentences(text: string): string[];
  getPhrases(text: string): string[];
  getWords(text: string): string[];
}

class LatinPunctuator implements Punctuator {
  private nonSentenceEndingAbbrev =
    /\b(?:[A-Za-z]|Adm|Assn|Ave|Blvd|Bldg|Brig|Capt|Cmdr|Col|Corp|Cpl|Ct|Dept|Dr|Drs|Fig|Figs|Fr|Ft|Gen|Gov|Hon|Inc|Jr|Lt|Ltd|Maj|Mr|Mrs|Ms|Mt|Mx|No|Nos|Pres|Prof|Rd|Rep|Rev|Sen|Sgt|Sr|St|Univ|Jan|Feb|Mar|Apr|Aug|Sep|Sept|Oct|Nov|Dec|dept|ed|eds|fig|figs|misc|pp|ref|refs|vol|vols|vs)\.\s+$/;

  getParagraphs(text: string) {
    return recombine(text.split(/((?:\r?\n\s*){2,})/));
  }
  getSentences(text: string) {
    return recombine(text.split(/([.!?]+[\s\u200b]+)/), this.nonSentenceEndingAbbrev);
  }
  getPhrases(text: string) {
    return recombine(text.split(/([,;:]\s+|\s-+\s+|—\s*)/));
  }
  getWords(text: string) {
    const tokens = text.split(/([~@#%^*_+=<>]|[\s\-—/]+|\.(?=\w{2,})|,(?=[0-9]))/);
    const result: string[] = [];
    for (let i = 0; i < tokens.length; i += 2) {
      if (tokens[i]) result.push(tokens[i]);
      if (i + 1 < tokens.length && result.length) result[result.length - 1] += tokens[i + 1];
    }
    return result;
  }
}

class EastAsianPunctuator implements Punctuator {
  getParagraphs(text: string) {
    return recombine(text.split(/((?:\r?\n\s*){2,})/));
  }
  getSentences(text: string) {
    return recombine(text.split(/([.!?]+[\s\u200b]+|[\u3002\uff01\uff1f]+)/));
  }
  getPhrases(text: string) {
    return recombine(text.split(/([,;:]\s+|[\u2025\u2026\u3000\u3001\uff0c\uff1b]+)/));
  }
  getWords(text: string) {
    return text.replace(/\s+/g, "").split("");
  }
}

function recombine(tokens: string[], nonPunc?: RegExp): string[] {
  const result: string[] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    const part = i + 1 < tokens.length ? tokens[i] + tokens[i + 1] : tokens[i];
    if (!part) continue;
    if (nonPunc && result.length && nonPunc.test(result[result.length - 1]))
      result[result.length - 1] += part;
    else result.push(part);
  }
  return result;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Vite Hot Module Replacement (HMR) cleanup
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try {
      activeController?.destroy();
      activeController = null;
    } catch (e) {
      console.warn("[HMR] Failed to dispose Piper reader controller:", e);
    }
  });
}
