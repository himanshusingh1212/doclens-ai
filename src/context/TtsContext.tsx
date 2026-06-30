import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { splitSentences, getBrowserVoices } from "@/lib/tts";

export type TtsSource = "original" | "ai";

interface TtsContextType {
  isPlaying: boolean;
  isPaused: boolean;
  sentences: string[];
  currentSentenceIndex: number;
  currentTextSource: TtsSource | null;
  activePageNumber: number | null;
  rate: number;
  selectedVoiceUri: string | null;
  availableVoices: SpeechSynthesisVoice[];
  continuousPlay: boolean;
  
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [sentences, setSentences] = useState<string[]>([]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
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

  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  
  // Utterance ref to prevent garbage collection during playback
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  // Track continuous sentence state to avoid race conditions
  const isTransitioningRef = useRef(false);

  // Initialize voices
  useEffect(() => {
    getBrowserVoices().then((voices) => {
      setAvailableVoices(voices);
      
      // Auto-select default voice if none set
      if (!selectedVoiceUri && voices.length > 0) {
        // Try to find a standard English voice first, or system default
        const defaultVoice = voices.find(v => v.lang.startsWith("en") || v.default) || voices[0];
        setSelectedVoiceUriState(defaultVoice.voiceURI);
      }
    });
  }, [selectedVoiceUri]);

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

  // Speaks the sentence at the specified index
  const speakSentence = useCallback((index: number, sentenceList: string[]) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    isTransitioningRef.current = false;

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

    setCurrentSentenceIndex(index);
    const rawSentence = sentenceList[index];
    const sentenceText = rawSentence.trim();

    if (!sentenceText) {
      if (isTransitioningRef.current) return;
      isTransitioningRef.current = true;
      speakSentence(index + 1, sentenceList);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(sentenceText);
    utteranceRef.current = utterance; // Keep reference to prevent GC

    // Apply voice settings
    const voice = availableVoices.find((v) => v.voiceURI === selectedVoiceUri);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = rate;

    utterance.onend = () => {
      // Avoid double transitions due to speechSynthesis bugs firing multiple events
      if (isTransitioningRef.current) return;
      isTransitioningRef.current = true;
      speakSentence(index + 1, sentenceList);
    };

    utterance.onerror = (e) => {
      // Ignore normal interruption / cancel events
      if (e.error === "interrupted" || e.error === "canceled") return;
      console.error("TTS SpeechSynthesisUtterance error:", e);
      setIsPlaying(false);
      setIsPaused(false);
    };

    window.speechSynthesis.speak(utterance);
  }, [availableVoices, selectedVoiceUri, rate, continuousPlay, activePageNumber, currentTextSource]);

  // Public controls
  const play = useCallback((text: string, source: TtsSource, pageNumber: number, startIndex: number = 0) => {
    const list = splitSentences(text);
    if (list.length === 0) return;
    
    setSentences(list);
    setCurrentTextSource(source);
    setActivePageNumber(pageNumber);
    setIsPlaying(true);
    setIsPaused(false);
    
    speakSentence(startIndex, list);
  }, [speakSentence]);

  const pause = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.pause();
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.resume();
    setIsPaused(false);
  }, []);

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    setSentences([]);
    setCurrentSentenceIndex(0);
    setCurrentTextSource(null);
    setActivePageNumber(null);
  }, []);

  const nextSentence = useCallback(() => {
    if (!isPlaying) return;
    speakSentence(currentSentenceIndex + 1, sentences);
  }, [isPlaying, currentSentenceIndex, sentences, speakSentence]);

  const prevSentence = useCallback(() => {
    if (!isPlaying) return;
    speakSentence(Math.max(0, currentSentenceIndex - 1), sentences);
  }, [isPlaying, currentSentenceIndex, sentences, speakSentence]);

  const seekSentence = useCallback((index: number) => {
    if (!isPlaying) return;
    speakSentence(index, sentences);
  }, [isPlaying, sentences, speakSentence]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

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
