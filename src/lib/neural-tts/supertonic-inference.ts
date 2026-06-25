/**
 * Supertonic TTS Inference Core
 *
 * Ported from supertonic/web/helper.js to TypeScript.
 * Handles ONNX Runtime inference for text-to-speech synthesis.
 */

import * as ort from "onnxruntime-web";

// ─── Constants ─────────────────────────────────────────────────────────────

export const AVAILABLE_LANGS = [
  "en", "ko", "ja", "ar", "bg", "cs", "da", "de", "el", "es",
  "et", "fi", "fr", "hi", "hr", "hu", "id", "it", "lt", "lv",
  "nl", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "tr", "uk",
  "vi", "na",
] as const;

export type SupertonicLang = (typeof AVAILABLE_LANGS)[number];

export function isValidLang(lang: string): lang is SupertonicLang {
  return (AVAILABLE_LANGS as readonly string[]).includes(lang);
}

// ─── Interfaces ────────────────────────────────────────────────────────────

export interface SupertonicConfig {
  ae: { sample_rate: number; base_chunk_size: number; chunk_compress_factor: number };
  ttl: { latent_dim: number; chunk_compress_factor: number };
  dp: Record<string, unknown>;
}

export interface VoiceStyleData {
  style_ttl: { dims: number[]; data: number[][][] };
  style_dp: { dims: number[]; data: number[][][] };
}

// ─── Style ─────────────────────────────────────────────────────────────────

export class Style {
  constructor(
    public readonly ttl: ort.Tensor,
    public readonly dp: ort.Tensor,
  ) {}
}

// ─── UnicodeProcessor ──────────────────────────────────────────────────────

export class UnicodeProcessor {
  constructor(private indexer: number[]) {}

  call(textList: string[], langList: string[]) {
    const processedTexts = textList.map((text, i) =>
      this.preprocessText(text, langList[i]),
    );
    const textIdsLengths = processedTexts.map((t) => t.length);
    const maxLen = Math.max(...textIdsLengths);

    const textIds = processedTexts.map((text) => {
      const row = new Array(maxLen).fill(0);
      for (let j = 0; j < text.length; j++) {
        const cp = text.codePointAt(j)!;
        row[j] = cp < this.indexer.length ? this.indexer[cp] : -1;
      }
      return row;
    });

    const textMask = this.getTextMask(textIdsLengths);
    return { textIds, textMask };
  }

  private preprocessText(text: string, lang: string): string {
    text = text.normalize("NFKD");

    // Remove emojis
    text = text.replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu,
      "",
    );

    // Replace dashes and symbols
    const replacements: Record<string, string> = {
      "\u2013": "-", "\u2011": "-", "\u2014": "-", "_": " ",
      "\u201C": '"', "\u201D": '"', "\u2018": "'", "\u2019": "'",
      "\u00B4": "'", "`": "'", "[": " ", "]": " ", "|": " ",
      "/": " ", "#": " ", "\u2192": " ", "\u2190": " ",
    };
    for (const [k, v] of Object.entries(replacements)) {
      text = text.replaceAll(k, v);
    }

    text = text.replace(/[♥☆♡©\\]/g, "");

    // Expression replacements
    const exprReplacements: Record<string, string> = {
      "@": " at ", "e.g.,": "for example, ", "i.e.,": "that is, ",
    };
    for (const [k, v] of Object.entries(exprReplacements)) {
      text = text.replaceAll(k, v);
    }

    // Fix spacing around punctuation
    text = text.replace(/ ,/g, ",").replace(/ \./g, ".").replace(/ !/g, "!");
    text = text.replace(/ \?/g, "?").replace(/ ;/g, ";").replace(/ :/g, ":");
    text = text.replace(/ '/g, "'");

    // Remove duplicate quotes
    while (text.includes('""')) text = text.replace('""', '"');
    while (text.includes("''")) text = text.replace("''", "'");

    // Clean spaces
    text = text.replace(/\s+/g, " ").trim();

    // Add period if missing terminal punctuation
    if (!/[.!?;:,'"')\]}\u2026\u3002\u300D\u300F\u3011\u3009\u300B\u203A\u00BB]$/.test(text)) {
      text += ".";
    }

    if (!isValidLang(lang)) {
      throw new Error(`Invalid language: ${lang}. Available: ${AVAILABLE_LANGS.join(", ")}`);
    }

    return `<${lang}>${text}</${lang}>`;
  }

  private getTextMask(lengths: number[]) {
    const maxLen = Math.max(...lengths);
    return this.lengthToMask(lengths, maxLen);
  }

  private lengthToMask(lengths: number[], maxLen?: number) {
    const actualMaxLen = maxLen || Math.max(...lengths);
    return lengths.map((len) => {
      const row = new Array(actualMaxLen).fill(0.0);
      for (let j = 0; j < Math.min(len, actualMaxLen); j++) row[j] = 1.0;
      return [row];
    });
  }
}

// ─── TextToSpeech ──────────────────────────────────────────────────────────

export class TextToSpeech {
  public readonly sampleRate: number;

  constructor(
    private cfgs: SupertonicConfig,
    private textProcessor: UnicodeProcessor,
    private dpOrt: ort.InferenceSession,
    private textEncOrt: ort.InferenceSession,
    private vectorEstOrt: ort.InferenceSession,
    private vocoderOrt: ort.InferenceSession,
  ) {
    this.sampleRate = cfgs.ae.sample_rate;
  }

  private async _infer(
    textList: string[],
    langList: string[],
    style: Style,
    totalStep: number,
    speed = 1.05,
    progressCallback?: (step: number, total: number) => void,
  ) {
    const bsz = textList.length;
    const { textIds, textMask } = this.textProcessor.call(textList, langList);

    const textIdsFlat = new BigInt64Array(textIds.flat().map((x) => BigInt(x)));
    const textIdsTensor = new ort.Tensor("int64", textIdsFlat, [bsz, textIds[0].length]);

    const textMaskFlat = new Float32Array(textMask.flat(2));
    const textMaskTensor = new ort.Tensor("float32", textMaskFlat, [bsz, 1, textMask[0][0].length]);

    // Duration prediction
    const dpOutputs = await this.dpOrt.run({
      text_ids: textIdsTensor, style_dp: style.dp, text_mask: textMaskTensor,
    });
    const duration = Array.from(dpOutputs.duration.data as Float32Array);
    for (let i = 0; i < duration.length; i++) duration[i] /= speed;

    // Text encoding
    const textEncOutputs = await this.textEncOrt.run({
      text_ids: textIdsTensor, style_ttl: style.ttl, text_mask: textMaskTensor,
    });
    const textEmb = textEncOutputs.text_emb;

    // Sample noisy latent
    let { xt, latentMask } = this.sampleNoisyLatent(
      duration, this.sampleRate,
      this.cfgs.ae.base_chunk_size,
      this.cfgs.ttl.chunk_compress_factor,
      this.cfgs.ttl.latent_dim,
    );

    const latentMaskFlat = new Float32Array(latentMask.flat(2));
    const latentMaskTensor = new ort.Tensor("float32", latentMaskFlat, [bsz, 1, latentMask[0][0].length]);

    const totalStepTensor = new ort.Tensor("float32", new Float32Array(bsz).fill(totalStep), [bsz]);

    // Denoising loop
    for (let step = 0; step < totalStep; step++) {
      progressCallback?.(step + 1, totalStep);
      const currentStepTensor = new ort.Tensor("float32", new Float32Array(bsz).fill(step), [bsz]);
      const xtFlat = new Float32Array(xt.flat(2));
      const xtTensor = new ort.Tensor("float32", xtFlat, [bsz, xt[0].length, xt[0][0].length]);

      const vectorEstOutputs = await this.vectorEstOrt.run({
        noisy_latent: xtTensor, text_emb: textEmb, style_ttl: style.ttl,
        latent_mask: latentMaskTensor, text_mask: textMaskTensor,
        current_step: currentStepTensor, total_step: totalStepTensor,
      });

      const denoised = Array.from(vectorEstOutputs.denoised_latent.data as Float32Array);
      const latentDim = xt[0].length;
      const latentLen = xt[0][0].length;
      xt = [];
      let idx = 0;
      for (let b = 0; b < bsz; b++) {
        const batch: number[][] = [];
        for (let d = 0; d < latentDim; d++) {
          const row: number[] = [];
          for (let t = 0; t < latentLen; t++) row.push(denoised[idx++]);
          batch.push(row);
        }
        xt.push(batch);
      }
    }

    // Vocoder
    const finalXtFlat = new Float32Array(xt.flat(2));
    const finalXtTensor = new ort.Tensor("float32", finalXtFlat, [bsz, xt[0].length, xt[0][0].length]);
    const vocoderOutputs = await this.vocoderOrt.run({ latent: finalXtTensor });
    const wav = Array.from(vocoderOutputs.wav_tts.data as Float32Array);
    return { wav, duration };
  }

  async synthesize(
    text: string,
    lang: string,
    style: Style,
    totalStep: number,
    speed = 1.05,
    silenceDuration = 0.3,
    progressCallback?: (step: number, total: number) => void,
  ): Promise<{ wav: number[]; duration: number[] }> {
    if (style.ttl.dims[0] !== 1) {
      throw new Error("Single speaker TTS only supports single style");
    }
    const maxLen = lang === "ko" || lang === "ja" ? 120 : 300;
    const textList = chunkText(text, maxLen);
    const langList = new Array(textList.length).fill(lang);
    let wavCat: number[] = [];
    let durCat = 0;

    for (let i = 0; i < textList.length; i++) {
      const { wav, duration } = await this._infer(
        [textList[i]], [langList[i]], style, totalStep, speed, progressCallback,
      );
      if (wavCat.length === 0) {
        wavCat = wav;
        durCat = duration[0];
      } else {
        const silenceLen = Math.floor(silenceDuration * this.sampleRate);
        const silence = new Array(silenceLen).fill(0);
        wavCat = [...wavCat, ...silence, ...wav];
        durCat += duration[0] + silenceDuration;
      }
    }
    return { wav: wavCat, duration: [durCat] };
  }

  private sampleNoisyLatent(
    duration: number[], sampleRate: number, baseChunkSize: number,
    chunkCompress: number, latentDim: number,
  ) {
    const bsz = duration.length;
    const maxDur = Math.max(...duration);
    const wavLenMax = Math.floor(maxDur * sampleRate);
    const wavLengths = duration.map((d) => Math.floor(d * sampleRate));
    const chunkSize = baseChunkSize * chunkCompress;
    const latentLen = Math.floor((wavLenMax + chunkSize - 1) / chunkSize);
    const latentDimVal = latentDim * chunkCompress;

    const xt: number[][][] = [];
    for (let b = 0; b < bsz; b++) {
      const batch: number[][] = [];
      for (let d = 0; d < latentDimVal; d++) {
        const row: number[] = [];
        for (let t = 0; t < latentLen; t++) {
          const u1 = Math.max(0.0001, Math.random());
          const u2 = Math.random();
          row.push(Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2));
        }
        batch.push(row);
      }
      xt.push(batch);
    }

    const latentLengths = wavLengths.map((len) => Math.floor((len + chunkSize - 1) / chunkSize));
    const latentMask = this.lengthToMask(latentLengths, latentLen);

    // Apply mask
    for (let b = 0; b < bsz; b++) {
      for (let d = 0; d < latentDimVal; d++) {
        for (let t = 0; t < latentLen; t++) {
          xt[b][d][t] *= latentMask[b][0][t];
        }
      }
    }
    return { xt, latentMask };
  }

  private lengthToMask(lengths: number[], maxLen?: number) {
    const actualMaxLen = maxLen || Math.max(...lengths);
    return lengths.map((len) => {
      const row = new Array(actualMaxLen).fill(0.0);
      for (let j = 0; j < Math.min(len, actualMaxLen); j++) row[j] = 1.0;
      return [row];
    });
  }
}

// ─── Loading utilities ─────────────────────────────────────────────────────

export async function loadVoiceStyle(styleData: VoiceStyleData): Promise<Style> {
  const ttlDims = styleData.style_ttl.dims;
  const dpDims = styleData.style_dp.dims;
  const ttlFlat = new Float32Array(styleData.style_ttl.data.flat(Infinity) as number[]);
  const dpFlat = new Float32Array(styleData.style_dp.data.flat(Infinity) as number[]);
  const ttlTensor = new ort.Tensor("float32", ttlFlat, [1, ttlDims[1], ttlDims[2]]);
  const dpTensor = new ort.Tensor("float32", dpFlat, [1, dpDims[1], dpDims[2]]);
  return new Style(ttlTensor, dpTensor);
}

export async function loadTextToSpeech(
  cfgs: SupertonicConfig,
  indexer: number[],
  sessions: {
    dp: ort.InferenceSession;
    textEnc: ort.InferenceSession;
    vectorEst: ort.InferenceSession;
    vocoder: ort.InferenceSession;
  },
): Promise<TextToSpeech> {
  const textProcessor = new UnicodeProcessor(indexer);
  return new TextToSpeech(
    cfgs, textProcessor,
    sessions.dp, sessions.textEnc, sessions.vectorEst, sessions.vocoder,
  );
}

// ─── Text chunking ─────────────────────────────────────────────────────────

function chunkText(text: string, maxLen = 300): string[] {
  if (typeof text !== "string") throw new Error(`chunkText expects a string, got ${typeof text}`);
  const paragraphs = text.trim().split(/\n\s*\n+/).filter((p) => p.trim());
  const chunks: string[] = [];

  for (let paragraph of paragraphs) {
    paragraph = paragraph.trim();
    if (!paragraph) continue;
    const sentences = paragraph.split(
      /(?<!Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.|Sr\.|Jr\.|Ph\.D\.|etc\.|e\.g\.|i\.e\.|vs\.|Inc\.|Ltd\.|Co\.|Corp\.|St\.|Ave\.|Blvd\.)(?<!\b[A-Z]\.)(?<=[.!?])\s+/,
    );
    let currentChunk = "";
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length + 1 <= maxLen) {
        currentChunk += (currentChunk ? " " : "") + sentence;
      } else {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      }
    }
    if (currentChunk) chunks.push(currentChunk.trim());
  }
  return chunks;
}
