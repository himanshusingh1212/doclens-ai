/**
 * Splits input text into clean sentence chunks.
 * Uses punctuation rules for Latin and East Asian languages.
 */
export function splitSentences(text: string): string[] {
  if (!text) return [];

  const isEastAsian = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(text);

  // Split by newlines, keeping the newlines in the tokens array
  const tokens = text.split(/(\r?\n+)/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    // If it's a newline token, append to current chunk and flush
    if (/^\r?\n+$/.test(token)) {
      currentChunk += token;
      chunks.push(currentChunk);
      currentChunk = "";
      continue;
    }

    // Otherwise, it is a text line.
    if (token.length <= 200) {
      currentChunk += token;
      continue;
    }

    // If the token is > 200 characters, losslessly split it.
    const subChunks = losslessSplit(token, 200, isEastAsian);
    for (let j = 0; j < subChunks.length; j++) {
      if (j === subChunks.length - 1) {
        currentChunk += subChunks[j];
      } else {
        chunks.push(subChunks[j]);
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function losslessSplit(text: string, limit: number, isEastAsian: boolean, level = 0): string[] {
  if (text.length <= limit) {
    return [text];
  }

  let tokens: string[] = [];
  if (level === 0) {
    if (isEastAsian) {
      tokens = text.split(/([\u3002\uff01\uff1f]+)/);
    } else {
      const nonSentenceEndingAbbrev = /\b(?:[A-Za-z]|Adm|Assn|Ave|Blvd|Bldg|Brig|Capt|Cmdr|Col|Comdr|Corp|Cpl|Ct|Dept|Dr|Drs|Fig|Figs|Fr|Ft|Gen|Gov|Hon|Inc|Jr|Lieut|Ln|Lt|Ltd|Maj|Messrs|Mmes|Mr|Mrs|Ms|Mt|Mx|No|Nos|Pl|Pres|Prof|Rd|Rep|Reps|Rev|Sen|Sens|Sgt|Sr|St|Ste|Univ|Jan|Feb|Mar|Apr|Aug|Sep|Sept|Oct|Nov|Dec|dept|ed|eds|est|fig|figs|misc|pp|ref|refs|vol|vols|vs)\.$/;
      const rawTokens = text.split(/([.!?]+[\s\u200b]+)/);
      for (let i = 0; i < rawTokens.length; i += 2) {
        const part = rawTokens[i];
        const sep = rawTokens[i + 1] || "";
        if (part) {
          if (tokens.length && nonSentenceEndingAbbrev.test(tokens[tokens.length - 1])) {
            tokens[tokens.length - 1] += part + sep;
          } else {
            tokens.push(part + sep);
          }
        }
      }
    }
  } else if (level === 1) {
    tokens = text.split(/([,;:，；：]+[\s\u200b]*)/);
  } else if (level === 2) {
    tokens = text.split(/(\s+)/);
  } else {
    tokens = text.split("");
  }

  const chunks: string[] = [];
  let current = "";

  for (const token of tokens) {
    if (!token) continue;
    
    if (token.length > limit) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      const subChunks = losslessSplit(token, limit, isEastAsian, level + 1);
      chunks.push(...subChunks);
    } else if (current.length + token.length <= limit) {
      current += token;
    } else {
      if (current) chunks.push(current);
      current = token;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

/**
 * Promise-wrapped speechSynthesis.getVoices() that resolves reliably
 * across browsers (handling initial cold loads when voices are not loaded yet).
 */
export function getBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve([]);
      return;
    }

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }

    // Fallback: wait for onvoiceschanged
    const handleVoicesChanged = () => {
      const updatedVoices = window.speechSynthesis.getVoices();
      if (updatedVoices.length > 0) {
        window.speechSynthesis.onvoiceschanged = null;
        resolve(updatedVoices);
      }
    };
    window.speechSynthesis.onvoiceschanged = handleVoicesChanged;

    // Timeout fallback just in case
    setTimeout(() => {
      if (window.speechSynthesis.onvoiceschanged === handleVoicesChanged) {
        window.speechSynthesis.onvoiceschanged = null;
        resolve(window.speechSynthesis.getVoices());
      }
    }, 1500);
  });
}
