import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { getOutputLanguage, setOutputLanguage } from "@/lib/openrouter";
import {
  createTtsController,
  getFavorites,
  getTtsVoiceFor,
  isTtsSupported,
  listVoices,
  setTtsVoiceFor,
  toggleFavorite,
} from "@/lib/tts";

export const Route = createFileRoute("/settings/voice")({
  component: VoicePage,
  head: () => ({ meta: [{ title: "DocLens — Voice" }] }),
});

const QUICK_LANGS = [
  "English", "Arabic", "French", "Hindi", "Spanish", "Japanese",
  "German", "Italian", "Portuguese", "Russian", "Chinese", "Korean",
];

function langCode(label: string): string {
  const m: Record<string, string> = {
    English: "en", Arabic: "ar", French: "fr", Hindi: "hi",
    Spanish: "es", Japanese: "ja", German: "de", Italian: "it",
    Portuguese: "pt", Russian: "ru", Chinese: "zh", Korean: "ko",
  };
  return m[label] ?? label.toLowerCase();
}

function VoicePage() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [language, setLanguage] = useState("English");
  const [selected, setSelected] = useState("");
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"matching" | "all">("matching");
  const [search, setSearch] = useState("");
  const [previewing, setPreviewing] = useState<string | null>(null);

  useEffect(() => {
    setLanguage(getOutputLanguage() || "English");
    setFavs(new Set(getFavorites()));
  }, []);

  useEffect(() => {
    setSelected(getTtsVoiceFor(language));
  }, [language]);

  useEffect(() => {
    if (!isTtsSupported()) return;
    const load = () => setVoices(listVoices());
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", load);
  }, []);

  const sorted = useMemo(() => {
    const code = langCode(language).toLowerCase();
    let list = voices.slice();
    if (filter === "matching") {
      list = list.filter((v) => v.lang.toLowerCase().startsWith(code));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.lang.toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => {
      const fa = favs.has(a.name) ? 0 : 1;
      const fb = favs.has(b.name) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      // matching language first
      const ma = a.lang.toLowerCase().startsWith(code) ? 0 : 1;
      const mb = b.lang.toLowerCase().startsWith(code) ? 0 : 1;
      if (ma !== mb) return ma - mb;
      return a.name.localeCompare(b.name);
    });
  }, [voices, favs, language, filter, search]);

  const handlePick = (name: string) => {
    setSelected(name);
    setTtsVoiceFor(language, name);
  };

  const handleStar = (name: string) => {
    toggleFavorite(name);
    setFavs(new Set(getFavorites()));
  };

  const handleLanguageChange = (l: string) => {
    setLanguage(l);
    setOutputLanguage(l);
  };

  const handlePreview = (v: SpeechSynthesisVoice) => {
    if (previewing === v.name) {
      window.speechSynthesis?.cancel();
      setPreviewing(null);
      return;
    }
    window.speechSynthesis?.cancel();
    const sample = sampleFor(language);
    // temporarily set so controller picks it
    const prev = getTtsVoiceFor(language);
    setTtsVoiceFor(language, v.name);
    const ctrl = createTtsController(sample, {
      language,
      onState: (s) => {
        if (s === "ended" || s === "idle") setPreviewing(null);
      },
    });
    ctrl.play();
    setPreviewing(v.name);
    // restore persisted selection (don't auto-save preview)
    setTtsVoiceFor(language, prev);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-6">
        <div className="mb-4 flex items-center justify-between">
          <Link
            to="/settings"
            className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            ← back
          </Link>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            voice
          </h2>
        </div>

        <header className="mb-5 rounded-lg border border-border bg-surface p-5">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-lg font-semibold text-foreground">Document language</span>
            <span className="text-muted-foreground">—</span>
            <span className="text-lg font-semibold text-primary">{language}</span>
          </div>
          <p className="mt-1 text-sm text-foreground/70">
            Select a text-to-speech voice for this language from the list of available ones.
          </p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {QUICK_LANGS.map((l) => (
              <button
                key={l}
                onClick={() => handleLanguageChange(l)}
                className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                  language === l
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
              <button
                onClick={() => setFilter("matching")}
                className={`rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest ${
                  filter === "matching" ? "bg-primary/15 text-primary" : "text-muted-foreground"
                }`}
              >
                matching
              </button>
              <button
                onClick={() => setFilter("all")}
                className={`rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest ${
                  filter === "all" ? "bg-primary/15 text-primary" : "text-muted-foreground"
                }`}
              >
                all voices
              </button>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search voices…"
              className="ml-auto w-56 rounded-md border border-border bg-background px-3 py-1 font-mono text-[12px] outline-none focus:border-primary"
            />
          </div>
        </header>

        {!isTtsSupported() && (
          <div className="rounded-md border border-border bg-surface p-4 font-mono text-[12px] text-muted-foreground">
            Web Speech API is not available in this browser.
          </div>
        )}

        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {sorted.length === 0 && (
            <li className="px-5 py-8 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              no voices found{filter === "matching" ? " for this language" : ""}
            </li>
          )}
          {sorted.map((v) => {
            const isSel = selected === v.name;
            const isFav = favs.has(v.name);
            const playing = previewing === v.name;
            return (
              <li key={v.name + v.lang}>
                <div
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                    isSel ? "bg-primary/5" : "hover:bg-background/40"
                  }`}
                >
                  <button
                    onClick={() => handlePick(v.name)}
                    className="flex flex-1 items-start gap-3 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-[15px] font-medium text-foreground">
                        {v.name}
                      </div>
                      <div className="truncate text-[12px] text-muted-foreground">
                        {voiceSubtitle(v)}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStar(v.name);
                        }}
                        aria-label={isFav ? "Unfavorite" : "Favorite"}
                        className={`mt-1.5 inline-flex items-center text-lg leading-none transition-colors ${
                          isFav ? "text-yellow-400" : "text-muted-foreground/50 hover:text-foreground"
                        }`}
                      >
                        {isFav ? "★" : "☆"}
                      </button>
                    </div>
                  </button>

                  <button
                    onClick={() => handlePreview(v)}
                    className="rounded-md border border-border bg-background px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                  >
                    {playing ? "■" : "▶"}
                  </button>

                  <button
                    onClick={() => handlePick(v.name)}
                    aria-label={isSel ? "Selected" : "Select"}
                    className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
                      isSel ? "border-primary" : "border-border"
                    }`}
                  >
                    {isSel && <span className="h-3 w-3 rounded-full bg-primary" />}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-4 font-mono text-[11px] text-muted-foreground">
          Selection is saved per-language. Tap ▶ to preview without changing your choice.
        </p>
      </main>
    </div>
  );
}

function voiceSubtitle(v: SpeechSynthesisVoice): string {
  const local = v.localService ? "local" : "online";
  return `${v.lang} · ${local}${v.default ? " · default" : ""}`;
}

function sampleFor(language: string): string {
  const m: Record<string, string> = {
    English: "The quick brown fox jumps over the lazy dog.",
    Arabic: "النص السريع لاختبار الصوت.",
    French: "Bonjour, ceci est un test de la voix.",
    Hindi: "यह आवाज़ का परीक्षण है।",
    Spanish: "Hola, esta es una prueba de voz.",
    Japanese: "これは音声テストです。",
    German: "Dies ist ein Sprachtest.",
    Italian: "Questo è un test vocale.",
    Portuguese: "Este é um teste de voz.",
    Russian: "Это тест голоса.",
    Chinese: "这是一个语音测试。",
    Korean: "이것은 음성 테스트입니다.",
  };
  return m[language] ?? "This is a voice test.";
}
