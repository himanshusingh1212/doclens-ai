import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  downloadPiperVoice,
  getPreferredPiperVoice,
  langKey,
  listInstalledPiperVoices,
  listPiperVoices,
  setPreferredPiperVoice,
  setTtsEngine,
  type PiperVoiceMeta,
  getTtsRate,
  setTtsRate,
  getTtsPitch,
  setTtsPitch,
  // Supertonic management
  areSupertonicModelsInstalled,
  downloadSupertonicModels,
  listSupertonicVoiceStyles,
  downloadSupertonicVoiceStyle,
  testSupertonicVoice,
  getSupertonicPreferredStyle,
  setSupertonicPreferredStyle,
  getTtsEngine,
  type TtsEngine,
  type SupertonicVoiceStyle,
} from "@/lib/tts";
import { setPiperReaderPlaybackRate } from "@/lib/piper-reader";
import { isLanguageSupported } from "@/lib/neural-tts/supertonic-engine";

interface Props {
  open: boolean;
  language: string;
  onOpenChange: (open: boolean) => void;
  onReady?: () => void;
}

export function TtsVoiceSetupDialog({ open, language, onOpenChange, onReady }: Props) {
  // Common states
  const [engine, setEngineState] = useState<TtsEngine>("auto");
  const [rate, setRateState] = useState(() => getTtsRate());
  const [pitch, setPitchState] = useState(() => getTtsPitch());
  const [downloading, setDownloading] = useState<string | null>(null);

  // Piper states
  const [piperVoices, setPiperVoices] = useState<PiperVoiceMeta[] | null>(null);
  const [installedPiper, setInstalledPiper] = useState<string[]>([]);
  const [piperProgress, setPiperProgress] = useState(0);

  // Supertonic states
  const [stInstalled, setStInstalled] = useState(false);
  const [stDownloading, setStDownloading] = useState(false);
  const [stProgress, setStProgress] = useState(0);
  const [stStyles, setStStyles] = useState<SupertonicVoiceStyle[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<string>("M1");

  useEffect(() => {
    if (open) {
      setRateState(getTtsRate());
      setPitchState(getTtsPitch());

      const currentEngine = getTtsEngine();
      setEngineState(currentEngine === "auto" ? "supertonic" : currentEngine);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    // Load Piper data
    void listInstalledPiperVoices()
      .then(setInstalledPiper)
      .catch(() => setInstalledPiper([]));
    void listPiperVoices()
      .then(setPiperVoices)
      .catch(() => {
        setPiperVoices([]);
        toast.error("Could not load Piper voice catalog.");
      });

    // Load Supertonic data
    void refreshSupertonic();
  }, [open]);

  const refreshSupertonic = async () => {
    try {
      const ok = await areSupertonicModelsInstalled().catch(() => false);
      setStInstalled(ok);
      if (ok) {
        const styles = await listSupertonicVoiceStyles().catch(() => [] as SupertonicVoiceStyle[]);
        setStStyles(styles);
        const pref = await getSupertonicPreferredStyle().catch(() => "M1");
        setSelectedStyle(pref);
      }
    } catch {}
  };

  const handleRateChange = (newRate: number) => {
    setRateState(newRate);
    setTtsRate(newRate);
    setPiperReaderPlaybackRate(newRate);
  };

  const handlePitchChange = (newPitch: number) => {
    setPitchState(newPitch);
    setTtsPitch(newPitch);
  };

  // Piper actions
  const code = langKey(language).split("-")[0].toLowerCase();
  const matchingPiperVoices = useMemo(() => {
    return (piperVoices ?? [])
      .filter((voice) => matchesPiperLanguage(voice, language, code))
      .sort((a, b) => qualityRank(a.quality) - qualityRank(b.quality) || a.name.localeCompare(b.name))
      .slice(0, 12);
  }, [piperVoices, code, language]);

  const selectedPiper = getPreferredPiperVoice();

  const choosePiper = (voiceId: string) => {
    setPreferredPiperVoice(voiceId);
    setTtsEngine("piper");
    setEngineState("piper");
    toast.success("Piper voice selected.");
    onOpenChange(false);
    onReady?.();
  };

  const installPiper = async (voice: PiperVoiceMeta) => {
    setDownloading(voice.key);
    setPiperProgress(0);
    try {
      await downloadPiperVoice(voice.key, (loaded, total) => {
        setPiperProgress(total > 0 ? Math.round((loaded / total) * 100) : 0);
      });
      setInstalledPiper((current) => Array.from(new Set([...current, voice.key])));
      choosePiper(voice.key);
    } catch (e) {
      toast.error(`Install failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setDownloading(null);
      setPiperProgress(0);
    }
  };

  // Supertonic actions
  const supertonicSupported = useMemo(() => isLanguageSupported(language), [language]);

  const installSupertonic = async () => {
    setStDownloading(true);
    setStProgress(0);
    try {
      await downloadSupertonicModels((loaded, total) => {
        setStProgress(total > 0 ? Math.round((loaded / total) * 100) : 0);
      });
      // Pre-download default styles
      await downloadSupertonicVoiceStyle("M1").catch(() => {});
      await downloadSupertonicVoiceStyle("F1").catch(() => {});
      await refreshSupertonic();
      setTtsEngine("supertonic");
      setEngineState("supertonic");
      toast.success("Supertonic studio models installed successfully!");
    } catch (e) {
      toast.error(`Supertonic install failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setStDownloading(false);
      setStProgress(0);
    }
  };

  const chooseSupertonicStyle = async (styleId: string) => {
    try {
      const style = stStyles.find((s) => s.id === styleId);
      if (style && !style.installed) {
        setDownloading(`supertonic:${styleId}`);
        await downloadSupertonicVoiceStyle(styleId);
        await refreshSupertonic();
      }
      await setSupertonicPreferredStyle(styleId);
      setTtsEngine("supertonic");
      setEngineState("supertonic");
      setSelectedStyle(styleId);
      toast.success(`Supertonic style ${styleId} selected.`);
      onOpenChange(false);
      onReady?.();
    } catch (e) {
      toast.error(`Select style failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setDownloading(null);
    }
  };

  const previewSupertonicStyle = async (styleId: string) => {
    try {
      const style = stStyles.find((s) => s.id === styleId);
      if (style && !style.installed) {
        setDownloading(`supertonic:${styleId}`);
        await downloadSupertonicVoiceStyle(styleId);
        await refreshSupertonic();
      }
      const testLang = supertonicSupported ? code : "en";
      await testSupertonicVoice(styleId, testLang);
    } catch (e) {
      toast.error(`Preview failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setDownloading(null);
    }
  };

  const chooseBrowser = () => {
    setTtsEngine("browser");
    setEngineState("browser");
    toast.success("Browser speech selected.");
    onOpenChange(false);
    onReady?.();
  };

  const renderStyleRow = (style: SupertonicVoiceStyle) => {
    const isSelected = selectedStyle === style.id && engine === "supertonic";
    const isDownloadingThis = downloading === `supertonic:${style.id}`;

    return (
      <div
        key={style.id}
        className={`flex items-center justify-between p-2 rounded-md border transition-all ${
          isSelected
            ? "border-primary bg-primary/10"
            : "border-border hover:border-muted-foreground/30 bg-surface-2"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`h-2.5 w-2.5 rounded-full border ${
              isSelected ? "border-primary bg-primary" : "border-border"
            }`}
          />
          <span className="text-xs font-semibold text-foreground">{style.id}</span>
          {!style.installed && (
            <span className="text-[8px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono uppercase tracking-widest">
              Get
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Test button */}
          <button
            onClick={() => previewSupertonicStyle(style.id)}
            disabled={!!downloading || stDownloading}
            className="p-1 hover:bg-surface-3 rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            title="Preview voice"
          >
            🔊
          </button>

          {/* Select button */}
          {isDownloadingThis ? (
            <span className="font-mono text-[9px] text-primary animate-pulse">Loading...</span>
          ) : style.installed ? (
            <button
              onClick={() => chooseSupertonicStyle(style.id)}
              className="text-[9px] font-mono uppercase tracking-widest text-primary hover:text-primary-hover px-1.5 py-0.5 border border-primary/20 rounded hover:bg-primary/5 transition-all"
            >
              Select
            </button>
          ) : (
            <button
              onClick={() => chooseSupertonicStyle(style.id)}
              className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground px-1.5 py-0.5 border border-border rounded hover:bg-surface transition-all"
            >
              Download
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>
            {engine === "supertonic"
              ? `Supertonic Studio Voice Setup`
              : engine === "piper"
                ? `Piper Local Voice Setup`
                : `Browser Voice Setup`}
          </DialogTitle>
          <DialogDescription>
            {engine === "supertonic"
              ? `Studio-grade offline neural voice config for ${language}`
              : engine === "piper"
                ? `Install or select a local Piper neural voice for ${language}`
                : `Use your browser's native built-in text-to-speech engine`}
          </DialogDescription>
        </DialogHeader>

        {/* Tab Selector */}
        <div className="flex border-b border-border mb-3">
          <button
            onClick={() => {
              setEngineState("supertonic");
              setTtsEngine("supertonic");
            }}
            className={`flex-1 py-1.5 text-center text-[10px] font-bold tracking-widest uppercase border-b-2 transition-all ${
              engine === "supertonic"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Supertonic 3 {supertonicSupported ? "✨" : ""}
          </button>
          <button
            onClick={() => {
              setEngineState("piper");
              setTtsEngine("piper");
            }}
            className={`flex-1 py-1.5 text-center text-[10px] font-bold tracking-widest uppercase border-b-2 transition-all ${
              engine === "piper"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Piper Neural
          </button>
          <button
            onClick={() => {
              setEngineState("browser");
              setTtsEngine("browser");
            }}
            className={`flex-1 py-1.5 text-center text-[10px] font-bold tracking-widest uppercase border-b-2 transition-all ${
              engine === "browser"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Browser Legacy
          </button>
        </div>

        <div className="grid min-h-0 gap-4 overflow-y-auto pr-1">
          {/* Supertonic Config Tab */}
          {engine === "supertonic" && (
            <div className="space-y-4">
              {!supertonicSupported && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 rounded-lg text-xs leading-relaxed">
                  ⚠️ <strong>Hindi / English supported natively:</strong> {language} is not natively supported by Supertonic. Playback will fall back to English models, or you can switch to the Piper tab which has native {language} models.
                </div>
              )}

              {!stInstalled ? (
                <div className="p-6 border border-border bg-surface-2 rounded-lg text-center space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">
                      Install Supertonic 3 Engine
                    </h3>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto">
                      Supertonic requires a one-time 22MB download containing the text processor and acoustic models to run 100% locally and privately in your browser.
                    </p>
                  </div>
                  {stDownloading ? (
                    <div className="max-w-xs mx-auto space-y-2">
                      <div className="flex justify-between text-xs font-mono text-primary">
                        <span>Downloading models...</span>
                        <span>{stProgress}%</span>
                      </div>
                      <div className="h-1.5 bg-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-200"
                          style={{ width: `${stProgress}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={installSupertonic}
                      className="bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold px-4 py-2 rounded-full transition-all"
                    >
                      Install Supertonic Models (22 MB)
                    </button>
                  )}
                </div>
              ) : (
                <section className="rounded-lg border border-border bg-surface p-4 space-y-4">
                  <div className="flex justify-between items-center border-b border-border pb-2">
                    <div>
                      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                        Supertonic Voices
                      </div>
                      <div className="text-xs text-foreground mt-0.5">
                        Choose a studio-grade neural style
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 border-b border-border pb-1">
                        Female Styles
                      </h4>
                      <div className="grid grid-cols-1 gap-2">
                        {stStyles.filter((s) => s.gender === "female").map(renderStyleRow)}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 border-b border-border pb-1">
                        Male Styles
                      </h4>
                      <div className="grid grid-cols-1 gap-2">
                        {stStyles.filter((s) => s.gender === "male").map(renderStyleRow)}
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* Piper Config Tab */}
          {engine === "piper" && (
            <section className="min-h-0 rounded-lg border border-border bg-surface">
              <div className="border-b border-border px-4 py-3">
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Piper voices
                </div>
                <div className="mt-1 text-sm text-foreground">
                  Offline neural voices cached after install
                </div>
              </div>
              <div className="max-h-[300px] overflow-auto">
                {piperVoices === null ? (
                  <div className="px-4 py-8 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    loading catalog...
                  </div>
                ) : matchingPiperVoices.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No Piper voices found for {language}.
                  </div>
                ) : (
                  matchingPiperVoices.map((voice) => {
                    const isInstalled = installedPiper.includes(voice.key);
                    const isDownloadingThis = downloading === voice.key;

                    return (
                      <div
                        key={voice.key}
                        className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0"
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full border ${
                            selectedPiper === voice.key && engine === "piper"
                              ? "border-primary bg-primary"
                              : "border-border"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-foreground">
                            {voice.name}
                          </div>
                          <div className="font-mono text-[9px] text-muted-foreground mt-0.5">
                            {voice.language.name_native} · {voice.quality} ·{" "}
                            {((voice.sizeBytes || 0) / 1e6).toFixed(1)} MB
                          </div>
                        </div>
                        {isDownloadingThis ? (
                          <span className="font-mono text-[10px] text-primary">{piperProgress}%</span>
                        ) : isInstalled ? (
                          <button
                            onClick={() => choosePiper(voice.key)}
                            className="rounded border border-border px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
                          >
                            select
                          </button>
                        ) : (
                          <button
                            onClick={() => installPiper(voice)}
                            disabled={!!downloading}
                            className="rounded border border-border px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
                          >
                            install
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          )}

          {/* Browser Config Tab */}
          {engine === "browser" && (
            <div className="p-6 border border-border bg-surface-2 rounded-lg text-center space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">
                  Use Browser Speech Engine
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Uses your browser's built-in synthetic text-to-speech voices. Low audio quality but requires 0MB downloads and is always ready.
                </p>
              </div>
              <button
                onClick={chooseBrowser}
                className="bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold px-4 py-2 rounded-full transition-all"
              >
                Use Browser Engine
              </button>
            </div>
          )}

          {/* Voice Tuning Section */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
              Voice Tuning
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Speed */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">Speed</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {rate.toFixed(1)}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={rate}
                  onChange={(e) => handleRateChange(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* Pitch */}
              {engine === "browser" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">Pitch</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {pitch.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={pitch}
                    onChange={(e) => handlePitchChange(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function qualityRank(quality: string): number {
  if (quality === "medium") return 0;
  if (quality === "high") return 1;
  if (quality === "low") return 2;
  return 3;
}

function matchesPiperLanguage(voice: PiperVoiceMeta, language: string, code: string): boolean {
  const requested = language.toLowerCase();
  const voiceCode = voice.language.code.toLowerCase().replace("_", "-");
  const family = voice.language.family?.toLowerCase();
  const native = voice.language.name_native.toLowerCase();
  const english = voice.language.name_english.toLowerCase();

  return (
    family === code ||
    voiceCode === code ||
    voiceCode.startsWith(`${code}-`) ||
    native === requested ||
    english === requested
  );
}
