/**
 * Splits input text into clean sentence chunks.
 * Uses punctuation rules for Latin and East Asian languages.
 */
export function splitSentences(text: string): string[] {
  if (!text) return [];

  // Check if text contains East Asian characters
  const isEastAsian = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(text);

  if (isEastAsian) {
    // East Asian sentence breaking using standard punctuation markers
    const tokens = text.split(/([.!?]+[\s\u200b]+|[\u3002\uff01\uff1f]+)/);
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
    // Latin sentence breaking with abbreviations lookup to prevent splitting inside e.g. "Mr.", "Dr."
    const nonSentenceEndingAbbrev = /\b(?:[A-Za-z]|Adm|Assn|Ave|Blvd|Bldg|Brig|Capt|Cmdr|Col|Comdr|Corp|Cpl|Ct|Dept|Dr|Drs|Fig|Figs|Fr|Ft|Gen|Gov|Hon|Inc|Jr|Lieut|Ln|Lt|Ltd|Maj|Messrs|Mmes|Mr|Mrs|Ms|Mt|Mx|No|Nos|Pl|Pres|Prof|Rd|Rep|Reps|Rev|Sen|Sens|Sgt|Sr|St|Ste|Univ|Jan|Feb|Mar|Apr|Aug|Sep|Sept|Oct|Nov|Dec|dept|ed|eds|est|fig|figs|misc|pp|ref|refs|vol|vols|vs)\.\s+$/;
    const tokens = text.split(/([.!?]+[\s\u200b]+)/);
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
