/**
 * Splits input text into clean sentence chunks.
 * Uses punctuation rules for Latin and East Asian languages.
 */
export function splitSentences(text: string): string[] {
  if (!text) return [];

  // Check if text contains East Asian characters
  const isEastAsian = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(text);

  // 1. Split by newlines first to isolate individual lines/paragraphs
  const lines = text.split(/\r?\n/);
  const chunks: string[] = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // If the line is short enough, keep it as one chunk
    if (line.length <= 200) {
      chunks.push(line);
      continue;
    }

    // 2. Split line into sentences using punctuation boundaries
    const sentences = splitParagraphIntoSentences(line, isEastAsian);

    for (let sentence of sentences) {
      sentence = sentence.trim();
      if (!sentence) continue;

      if (sentence.length <= 200) {
        chunks.push(sentence);
        continue;
      }

      // 3. Split by clause boundaries if still too long
      const clauses = sentence.split(/(?<=[,;:，；：])\s+/);
      for (let clause of clauses) {
        clause = clause.trim();
        if (!clause) continue;

        if (clause.length <= 200) {
          chunks.push(clause);
          continue;
        }

        // 4. Split by word boundaries if still too long
        const words = clause.split(/\s+/);
        let currentChunk = "";

        for (const word of words) {
          if (!word) continue;
          if ((currentChunk + " " + word).trim().length <= 200) {
            currentChunk = currentChunk ? currentChunk + " " + word : word;
          } else {
            if (currentChunk) {
              chunks.push(currentChunk);
            }
            currentChunk = word;
          }
        }
        if (currentChunk) {
          chunks.push(currentChunk);
        }
      }
    }
  }

  return chunks;
}

function splitParagraphIntoSentences(paragraph: string, isEastAsian: boolean): string[] {
  if (isEastAsian) {
    const tokens = paragraph.split(/([.!?]+[\s\u200b]+|[\u3002\uff01\uff1f]+)/);
    const result: string[] = [];
    for (let i = 0; i < tokens.length; i += 2) {
      if (i + 1 < tokens.length) {
        result.push(tokens[i] + tokens[i + 1]);
      } else if (tokens[i]) {
        result.push(tokens[i]);
      }
    }
    return result.map(s => s.trim()).filter(Boolean);
  } else {
    const nonSentenceEndingAbbrev = /\b(?:[A-Za-z]|Adm|Assn|Ave|Blvd|Bldg|Brig|Capt|Cmdr|Col|Comdr|Corp|Cpl|Ct|Dept|Dr|Drs|Fig|Figs|Fr|Ft|Gen|Gov|Hon|Inc|Jr|Lieut|Ln|Lt|Ltd|Maj|Messrs|Mmes|Mr|Mrs|Ms|Mt|Mx|No|Nos|Pl|Pres|Prof|Rd|Rep|Reps|Rev|Sen|Sens|Sgt|Sr|St|Ste|Univ|Jan|Feb|Mar|Apr|Aug|Sep|Sept|Oct|Nov|Dec|dept|ed|eds|est|fig|figs|misc|pp|ref|refs|vol|vols|vs)\.\s+$/;
    const tokens = paragraph.split(/([.!?]+[\s\u200b]+)/);
    const result: string[] = [];
    for (let i = 0; i < tokens.length; i += 2) {
      const part = (i + 1 < tokens.length) ? (tokens[i] + tokens[i + 1]) : tokens[i];
      if (part) {
        if (result.length && nonSentenceEndingAbbrev.test(result[result.length - 1])) {
          result[result.length - 1] += part;
        } else {
          result.push(part);
        }
      }
    }
    return result.map(s => s.trim()).filter(Boolean);
  }
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
