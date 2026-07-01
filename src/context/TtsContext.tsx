import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { splitSentences, getBrowserVoices } from "@/lib/tts";
import { toast } from "sonner";

export type TtsSource = "original" | "ai";

export interface TtsVoice {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
  isNeural?: boolean;
}

interface TtsContextType {
  isPlaying: boolean;
  isPaused: boolean;
  sentences: string[];
  currentSentenceIndex: number;
  currentTextSource: TtsSource | null;
  activePageNumber: number | null;
  rate: number;
  selectedVoiceUri: string | null;
  availableVoices: TtsVoice[];
  continuousPlay: boolean;
  isNeuralLoading: boolean;
  
  play: (text: string, source: TtsSource, pageNumber: number, startIndex?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  nextSentence: () => void;
  prevSentence: () => void;
  seekSentence: (index: number) => void;
  setRate: (rate: number) => void;
  setSelectedVoiceUri: (uri: string | null) => void;
  setContinuousPlay: (continuous: boolean) => void;
}

const TtsContext = createContext<TtsContextType | undefined>(undefined);

export function TtsProvider({ children }: { children: React.ReactNode }) {
  const isPlayingRef = useRef(false);
  const [isPlaying, setIsPlayingState] = useState(false);
  const setIsPlaying = useCallback((val: boolean) => {
    setIsPlayingState(val);
    isPlayingRef.current = val;
  }, []);

  const isPausedRef = useRef(false);
  const [isPaused, setIsPausedState] = useState(false);
  const setIsPaused = useCallback((val: boolean) => {
    setIsPausedState(val);
    isPausedRef.current = val;
  }, []);

  const sentencesRef = useRef<string[]>([]);
  const [sentences, setSentencesState] = useState<string[]>([]);
  const setSentences = useCallback((val: string[]) => {
    setSentencesState(val);
    sentencesRef.current = val;
  }, []);

  const currentSentenceIndexRef = useRef(0);
  const [currentSentenceIndex, setCurrentSentenceIndexState] = useState(0);
  const setCurrentSentenceIndex = useCallback((val: number) => {
    setCurrentSentenceIndexState(val);
    currentSentenceIndexRef.current = val;
  }, []);

  const [currentTextSource, setCurrentTextSource] = useState<TtsSource | null>(null);
  const [activePageNumber, setActivePageNumber] = useState<number | null>(null);
  
  // Persist rate, voice, and continuous play to localStorage
  const [rate, setRateState] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("doclens:tts-rate");
      return stored ? parseFloat(stored) : 1.0;
    }
    return 1.0;
  });
  
  const [selectedVoiceUri, setSelectedVoiceUriState] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("doclens:tts-voice-uri");
    }
    return null;
  });
  
  const [continuousPlay, setContinuousPlayState] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("doclens:tts-continuous");
      return stored ? stored === "true" : true;
    }
    return true;
  });

  const [availableVoices, setAvailableVoices] = useState<TtsVoice[]>([]);
  const [isNeuralLoading, setIsNeuralLoading] = useState(false);
  const [neuralVoices, setNeuralVoices] = useState<TtsVoice[]>([]);
  
  // Utterance and Audio refs to prevent garbage collection during playback
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioUrlRef = useRef<string | null>(null);
  const nextAudioUrlRef = useRef<string | null>(null);
  const nextAudioIndexRef = useRef<number | null>(null);
  const loadingIndexRef = useRef<number | null>(null);
  const transitionTimeoutRef = useRef<any>(null);
  const ttsRef = useRef<any>(null);
  // Track continuous sentence state to avoid race conditions
  const isTransitioningRef = useRef(false);

  // Initialize and merge voices
  useEffect(() => {
    getBrowserVoices().then((voices) => {
      const native: TtsVoice[] = voices.map((v) => ({
        voiceURI: v.voiceURI,
        name: v.name,
        lang: v.lang,
        localService: v.localService,
        default: v.default,
        isNeural: false,
      }));

      const combined = [...native, ...neuralVoices];
      setAvailableVoices(combined);
      
      // Auto-select default voice if none set
      if (!selectedVoiceUri && combined.length > 0) {
        const defaultVoice = combined.find(v => v.lang.startsWith("en") || v.default) || combined[0];
        setSelectedVoiceUriState(defaultVoice.voiceURI);
      }
    });
  }, [neuralVoices, selectedVoiceUri]);

  // Load neural voices dynamically (Client-side only)
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Dynamic import to prevent SSR crashes
    import("@diffusionstudio/vits-web").then(async (mod) => {
      ttsRef.current = mod;

      // Mutate PATH_MAP to register our Hindi and English neural voices
      (mod.PATH_MAP as any)["hi_IN-rohan-medium"] = "hi/hi_IN/rohan/medium/hi_IN-rohan-medium.onnx";
      (mod.PATH_MAP as any)["hi_IN-priyamvada-medium"] = "hi/hi_IN/priyamvada/medium/hi_IN-priyamvada-medium.onnx";
      (mod.PATH_MAP as any)["hi_IN-pratham-medium"] = "hi/hi_IN/pratham/medium/hi_IN-pratham-medium.onnx";

      // Import onnxruntime-web to monkeypatch session creation
      const ortModule = "onnxruntime-web";
      import(ortModule).then((ort: any) => {
        if (!ort.InferenceSession.originalCreate) {
          ort.InferenceSession.originalCreate = ort.InferenceSession.create;
          const sessionCache = new Map<string, any>();
          
          ort.InferenceSession.create = async function (model: any, options?: any) {
            const cacheKey = model instanceof ArrayBuffer
              ? `${model.byteLength}-${new Uint8Array(model.slice(0, 100)).join(",")}`
              : String(model);
            
            if (sessionCache.has(cacheKey)) {
              return sessionCache.get(cacheKey);
            }
            
            const session = await ort.InferenceSession.originalCreate(model, options);
            sessionCache.set(cacheKey, session);
            return session;
          };
        }
      }).catch((err: any) => {
        console.error("Failed to patch onnxruntime-web:", err);
      });

      // Redirect global fetch calls for Hindi/hi_IN to Rhasspy repository
      const originalFetch = window.fetch;
      window.fetch = function (input, init) {
        if (typeof input === "string" && input.includes("/hi/hi_IN/")) {
          const redirectedUrl = input.replace(
            "https://huggingface.co/diffusionstudio/piper-voices/resolve/main",
            "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0"
          );
          return originalFetch(redirectedUrl, init);
        }
        return originalFetch(input, init);
      };

      try {
        const vitsVoices = await mod.voices();
        
        // Filter and map voices to include Hindi and English Neural voices
        const englishNeural = vitsVoices
          .filter((v: any) => v.key.startsWith("en_US-"))
          .map((v: any) => ({
            voiceURI: v.key,
            name: `✨ Neural ${v.name} (US English - Download & Cache)`,
            lang: "en-US",
            localService: true,
            default: false,
            isNeural: true
          }));

        const hindiNeural: TtsVoice[] = [
          {
            voiceURI: "hi_IN-rohan-medium",
            name: "✨ Neural Rohan (Hindi - Download & Cache)",
            lang: "hi-IN",
            localService: true,
            default: false,
            isNeural: true
          },
          {
            voiceURI: "hi_IN-priyamvada-medium",
            name: "✨ Neural Priyamvada (Hindi - Download & Cache)",
            lang: "hi-IN",
            localService: true,
            default: false,
            isNeural: true
          },
          {
            voiceURI: "hi_IN-pratham-medium",
            name: "✨ Neural Pratham (Hindi - Download & Cache)",
            lang: "hi-IN",
            localService: true,
            default: false,
            isNeural: true
          }
        ];

        setNeuralVoices([...hindiNeural, ...englishNeural]);
      } catch (err) {
        console.error("Failed to load VITS voices:", err);
      }
    }).catch((err) => {
      console.error("Failed to import @diffusionstudio/vits-web:", err);
    });
  }, []);

  // Setters with localStorage persistence
  const setRate = (newRate: number) => {
    setRateState(newRate);
    localStorage.setItem("doclens:tts-rate", newRate.toString());
  };

  const setSelectedVoiceUri = (uri: string | null) => {
    setSelectedVoiceUriState(uri);
    if (uri) {
      localStorage.setItem("doclens:tts-voice-uri", uri);
    } else {
      localStorage.removeItem("doclens:tts-voice-uri");
    }
  };

  const setContinuousPlay = (val: boolean) => {
    setContinuousPlayState(val);
    localStorage.setItem("doclens:tts-continuous", val.toString());
  };
  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      try {
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.pause();
      } catch (e) {}
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (activeAudioUrlRef.current) {
      try {
        URL.revokeObjectURL(activeAudioUrlRef.current);
      } catch (e) {}
      activeAudioUrlRef.current = null;
    }
    if (nextAudioUrlRef.current) {
      try {
        URL.revokeObjectURL(nextAudioUrlRef.current);
      } catch (e) {}
      nextAudioUrlRef.current = null;
    }
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    nextAudioIndexRef.current = null;
    loadingIndexRef.current = null;
  }, []);

  const preSynthesizeNext = useCallback((nextIndex: number, sentenceList: string[]) => {
    if (nextIndex < 0 || nextIndex >= sentenceList.length) return;
    
    // If already pre-synthesized/synthesizing this index, skip
    if (nextAudioIndexRef.current === nextIndex) return;

    const nextRawSentence = sentenceList[nextIndex];
    const nextSentenceText = nextRawSentence.trim();
    if (!nextSentenceText) return;

    const voice = availableVoices.find((v) => v.voiceURI === selectedVoiceUri);
    if (!voice?.isNeural || !ttsRef.current) return;

    // Set the index to indicate background compilation in progress
    nextAudioIndexRef.current = nextIndex;

    ttsRef.current.predict({
      text: nextSentenceText,
      voiceId: selectedVoiceUri
    }).then((wavBlob: Blob) => {
      // Check if we are still on the path to play this (i.e. we haven't skipped past it)
      if (nextAudioIndexRef.current === nextIndex) {
        if (nextAudioUrlRef.current) {
          URL.revokeObjectURL(nextAudioUrlRef.current);
        }
        nextAudioUrlRef.current = URL.createObjectURL(wavBlob);
      }
    }).catch((err: any) => {
      console.warn("Failed to pre-synthesize chunk:", err);
      if (nextAudioIndexRef.current === nextIndex) {
        nextAudioIndexRef.current = null;
      }
    });
  }, [availableVoices, selectedVoiceUri]);

  // Speaks the sentence at the specified index
  const speakSentence = useCallback((index: number, sentenceList: string[]) => {
    isTransitioningRef.current = false;
    
    // Clear any previous active audio element before starting a new one.
    // Do NOT call cleanupAudio() because we want to preserve nextAudioUrlRef (pre-synthesized)!
    if (audioRef.current) {
      try {
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.pause();
      } catch (e) {}
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (activeAudioUrlRef.current) {
      try {
        URL.revokeObjectURL(activeAudioUrlRef.current);
      } catch (e) {}
      activeAudioUrlRef.current = null;
    }
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    
    loadingIndexRef.current = null;

    if (index < 0 || index >= sentenceList.length) {
      // Completed current text source
      if (continuousPlay && activePageNumber !== null) {
        // Auto-advance to next page
        window.dispatchEvent(
          new CustomEvent("doclens:tts-next-page", {
            detail: { currentPage: activePageNumber, source: currentTextSource }
          })
        );
      } else {
        // Complete playback
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentSentenceIndex(0);
      }
      return;
    }

    setIsPaused(false);
    setCurrentSentenceIndex(index);
    const rawSentence = sentenceList[index];
    const sentenceText = rawSentence.trim();

    if (!sentenceText) {
      if (isTransitioningRef.current) return;
      isTransitioningRef.current = true;
      speakSentence(index + 1, sentenceList);
      return;
    }

    const voice = availableVoices.find((v) => v.voiceURI === selectedVoiceUri);

    const playNeuralAudio = (audioUrl: string) => {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.playbackRate = rate;

      audio.onended = () => {
        if (isTransitioningRef.current) return;
        isTransitioningRef.current = true;

        if (activeAudioUrlRef.current === audioUrl) {
          URL.revokeObjectURL(audioUrl);
          activeAudioUrlRef.current = null;
        }

        const nextIdx = index + 1;
        if (nextIdx < sentenceList.length) {
          setCurrentSentenceIndex(nextIdx);
        }

        if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = setTimeout(() => {
          transitionTimeoutRef.current = null;
          if (isPausedRef.current) return;
          speakSentence(nextIdx, sentenceList);
        }, 250);
      };

      audio.onerror = (err) => {
        console.error("Neural playback error:", err);
        if (activeAudioUrlRef.current === audioUrl) {
          URL.revokeObjectURL(audioUrl);
          activeAudioUrlRef.current = null;
        }
        setIsPlaying(false);
      };

      // Pre-synthesize the next chunk in the background immediately!
      preSynthesizeNext(index + 1, sentenceList);

      audio.play().catch(e => {
        console.error("Audio play failed:", e);
      });
    };

    if (voice?.isNeural) {
      if (!ttsRef.current) {
        console.error("VITS TTS Engine not loaded yet.");
        setIsPlaying(false);
        return;
      }

      // Check if this sentence was already pre-synthesized
      if (nextAudioUrlRef.current && nextAudioIndexRef.current === index) {
        const audioUrl = nextAudioUrlRef.current;
        activeAudioUrlRef.current = audioUrl;

        // Reset next refs so the next index can pre-synthesize
        nextAudioUrlRef.current = null;
        nextAudioIndexRef.current = null;

        playNeuralAudio(audioUrl);
      } else {
        // Mismatch or not pre-synthesized yet, revoke next if any and compile now
        if (nextAudioUrlRef.current) {
          URL.revokeObjectURL(nextAudioUrlRef.current);
          nextAudioUrlRef.current = null;
          nextAudioIndexRef.current = null;
        }

        loadingIndexRef.current = index;
        setIsNeuralLoading(true);
        
        let toastId: string | number | undefined;

        ttsRef.current.predict({
          text: sentenceText,
          voiceId: selectedVoiceUri
        }, (progress: any) => {
          if (loadingIndexRef.current !== index) return;
          const pct = Math.round(progress.loaded * 100 / progress.total);
          if (!toastId) {
            toastId = toast.loading(`Downloading Voice Model: ${pct}%`);
          } else {
            toast.loading(`Downloading Voice Model: ${pct}%`, { id: toastId });
          }
        }).then((wavBlob: Blob) => {
          if (toastId) toast.dismiss(toastId);
          if (loadingIndexRef.current !== index) {
            setIsNeuralLoading(false);
            return;
          }
          setIsNeuralLoading(false);

          const audioUrl = URL.createObjectURL(wavBlob);
          activeAudioUrlRef.current = audioUrl;
          playNeuralAudio(audioUrl);
        }).catch((err: any) => {
          if (toastId) toast.dismiss(toastId);
          if (loadingIndexRef.current !== index) return;
          setIsNeuralLoading(false);
          console.error("Neural synthesis error:", err);
          toast.error("Failed to generate neural speech");
          setIsPlaying(false);
        });
      }
    } else {
      // Standard Native / Browser Web Speech API
      if (typeof window === "undefined" || !window.speechSynthesis) return;

      const utterance = new SpeechSynthesisUtterance(sentenceText);
      utteranceRef.current = utterance; // Keep reference to prevent GC

      if (voice) {
        const nativeVoice = window.speechSynthesis.getVoices().find(v => v.voiceURI === voice.voiceURI);
        if (nativeVoice) {
          utterance.voice = nativeVoice;
          utterance.lang = nativeVoice.lang;
        }
      }
      utterance.rate = rate;

      utterance.onend = () => {
        if (isTransitioningRef.current) return;
        isTransitioningRef.current = true;
        speakSentence(index + 1, sentenceList);
      };

      utterance.onerror = (e) => {
        if (e.error === "interrupted" || e.error === "canceled") return;
        console.error("TTS SpeechSynthesisUtterance error:", e);
        setIsPlaying(false);
        setIsPaused(false);
      };

      window.speechSynthesis.speak(utterance);
    }
  }, [availableVoices, selectedVoiceUri, rate, continuousPlay, activePageNumber, currentTextSource, preSynthesizeNext]);

  // Public controls
  const play = useCallback((text: string, source: TtsSource, pageNumber: number, startIndex: number = 0) => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    cleanupAudio();

    const list = splitSentences(text);
    if (list.length === 0) return;
    
    setSentences(list);
    setCurrentTextSource(source);
    setActivePageNumber(pageNumber);
    setIsPlaying(true);
    setIsPaused(false);
    
    speakSentence(startIndex, list);
  }, [speakSentence, cleanupAudio]);

  const pause = useCallback(() => {
    setIsPaused(true);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.pause();
    }
  }, [setIsPaused]);

  const resume = useCallback(() => {
    setIsPaused(false);
    if (audioRef.current && !audioRef.current.ended) {
      audioRef.current.play().catch(e => console.error("Resume failed:", e));
    } else {
      speakSentence(currentSentenceIndexRef.current, sentencesRef.current);
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.resume();
    }
  }, [speakSentence, setIsPaused]);

  const stop = useCallback(() => {
    cleanupAudio();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setIsPaused(false);
    setSentences([]);
    setCurrentSentenceIndex(0);
    setCurrentTextSource(null);
    setActivePageNumber(null);
  }, [cleanupAudio, setIsPlaying, setIsPaused, setSentences, setCurrentSentenceIndex]);

  const nextSentence = useCallback(() => {
    if (!isPlayingRef.current) return;
    cleanupAudio();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    speakSentence(currentSentenceIndexRef.current + 1, sentencesRef.current);
  }, [speakSentence, cleanupAudio]);

  const prevSentence = useCallback(() => {
    if (!isPlayingRef.current) return;
    cleanupAudio();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    speakSentence(Math.max(0, currentSentenceIndexRef.current - 1), sentencesRef.current);
  }, [speakSentence, cleanupAudio]);

  const seekSentence = useCallback((index: number) => {
    if (!isPlayingRef.current) return;
    cleanupAudio();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    speakSentence(index, sentencesRef.current);
  }, [speakSentence, cleanupAudio]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanupAudio();
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [cleanupAudio]);

  // Automatically switch voice if changed during active playback
  useEffect(() => {
    if (isPlayingRef.current && selectedVoiceUri) {
      // Pause/Cancel the current playing engine
      if (audioRef.current) {
        try {
          audioRef.current.onended = null;
          audioRef.current.onerror = null;
          audioRef.current.pause();
        } catch (e) {}
        audioRef.current.src = "";
        audioRef.current = null;
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      
      // Revoke any active URL
      if (activeAudioUrlRef.current) {
        try {
          URL.revokeObjectURL(activeAudioUrlRef.current);
        } catch (e) {}
        activeAudioUrlRef.current = null;
      }
      
      // Revoke pre-synthesized URL because it was for the old voice!
      if (nextAudioUrlRef.current) {
        try {
          URL.revokeObjectURL(nextAudioUrlRef.current);
        } catch (e) {}
        nextAudioUrlRef.current = null;
        nextAudioIndexRef.current = null;
      }

      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }

      // Resume playback at the current sentence with the new voice
      speakSentence(currentSentenceIndexRef.current, sentencesRef.current);
    }
  }, [selectedVoiceUri, speakSentence]);

  return (
    <TtsContext.Provider
      value={{
        isPlaying,
        isPaused,
        sentences,
        currentSentenceIndex,
        currentTextSource,
        activePageNumber,
        rate,
        selectedVoiceUri,
        availableVoices,
        continuousPlay,
        isNeuralLoading,
        play,
        pause,
        resume,
        stop,
        nextSentence,
        prevSentence,
        seekSentence,
        setRate,
        setSelectedVoiceUri,
        setContinuousPlay
      }}
    >
      {children}
    </TtsContext.Provider>
  );
}

export function useTts() {
  const context = useContext(TtsContext);
  if (!context) {
    throw new Error("useTts must be used within a TtsProvider");
  }
  return context;
}
