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
  getTtsVoiceFor,
  langKey,
  listInstalledPiperVoices,
  listPiperVoices,
  listVoices,
  setPreferredPiperVoice,
  setTtsEngine,
  setTtsVoiceFor,
  type PiperVoiceMeta,
} from "@/lib/tts";

interface Props {
  open: boolean;
  language: string;
  onOpenChange: (open: boolean) => void;
  onReady?: () => void;
}

export function TtsVoiceSetupDialog({ open, language, onOpenChange, onReady }: Props) {
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [piperVoices, setPiperVoices] = useState<PiperVoiceMeta[] | null>(null);
  const [installed, setInstalled] = useState<string[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!open) return;
    const loadBrowserVoices = () => setBrowserVoices(listVoices());
    loadBrowserVoices();
    window.speechSynthesis?.addEventListener?.("voiceschanged", loadBrowserVoices);
    void listInstalledPiperVoices().then(setInstalled).catch(() => setInstalled([]));
    void listPiperVoices().then(setPiperVoices).catch(() => {
      setPiperVoices([]);
      toast.error("Could not load Piper voice catalog.");
    });
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", loadBrowserVoices);
  }, [open]);

  const code = langKey(language).split("-")[0].toLowerCase();

  const matchingBrowserVoices = useMemo(() => {
    return browserVoices
      .filter((voice) => voice.lang.toLowerCase().startsWith(code))
      .sort((a, b) => Number(a.localService) - Number(b.localService) || a.name.localeCompare(b.name));
  }, [browserVoices, code]);

  const matchingPiperVoices = useMemo(() => {
    return (piperVoices ?? [])
      .filter((voice) => {
        return matchesPiperLanguage(voice, language, code);
      })
      .sort((a, b) => qualityRank(a.quality) - qualityRank(b.quality) || a.name.localeCompare(b.name))
      .slice(0, 12);
  }, [piperVoices, code, language]);

  const selectedBrowser = getTtsVoiceFor(language);
  const selectedPiper = getPreferredPiperVoice();

  const chooseBrowser = (voice: SpeechSynthesisVoice) => {
    setTtsVoiceFor(language, voice.name);
    setTtsEngine("auto");
    toast.success(`Voice set to ${voice.name}.`);
    onOpenChange(false);
    onReady?.();
  };

  const choosePiper = (voiceId: string) => {
    setPreferredPiperVoice(voiceId);
    setTtsEngine("auto");
    toast.success("Piper voice selected.");
    onOpenChange(false);
    onReady?.();
  };

  const installPiper = async (voice: PiperVoiceMeta) => {
    setDownloading(voice.key);
    setProgress(0);
    try {
      await downloadPiperVoice(voice.key, (loaded, total) => {
        setProgress(total > 0 ? Math.round((loaded / total) * 100) : 0);
      });
      setInstalled((current) => Array.from(new Set([...current, voice.key])));
      choosePiper(voice.key);
    } catch (e) {
      toast.error(`Install failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setDownloading(null);
      setProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>Select a voice for {language}</DialogTitle>
          <DialogDescription>
            Choose a browser voice or install a Piper neural voice before playback starts.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 md:grid-cols-2">
          <section className="min-h-0 rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                browser voices
              </div>
              <div className="mt-1 text-sm text-foreground">
                Google and system TTS voices available in this browser
              </div>
            </div>
            <div className="max-h-[420px] overflow-auto">
              {matchingBrowserVoices.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No browser voices found for {language}.
                </div>
              ) : (
                matchingBrowserVoices.map((voice) => (
                  <button
                    key={`${voice.name}-${voice.lang}`}
                    onClick={() => chooseBrowser(voice)}
                    className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-background/60"
                  >
                    <span className={`h-3 w-3 rounded-full border ${selectedBrowser === voice.name ? "border-primary bg-primary" : "border-border"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{voice.name}</span>
                      <span className="block font-mono text-[10px] text-muted-foreground">
                        {voice.lang} · {voice.localService ? "local" : "online"}{voice.default ? " · default" : ""}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="min-h-0 rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Piper voices
              </div>
              <div className="mt-1 text-sm text-foreground">
                Offline neural voices cached after install
              </div>
            </div>
            <div className="max-h-[420px] overflow-auto">
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
                  const isInstalled = installed.includes(voice.key);
                  return (
                    <div
                      key={voice.key}
                      className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
                    >
                      <span className={`h-3 w-3 rounded-full border ${selectedPiper === voice.key ? "border-primary bg-primary" : "border-border"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">{voice.name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {voice.language.name_native} · {voice.quality} · {((voice.sizeBytes || 0) / 1e6).toFixed(1)} MB
                        </div>
                      </div>
                      {downloading === voice.key ? (
                        <span className="font-mono text-[10px] text-primary">{progress}%</span>
                      ) : isInstalled ? (
                        <button
                          onClick={() => choosePiper(voice.key)}
                          className="rounded border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary"
                        >
                          select
                        </button>
                      ) : (
                        <button
                          onClick={() => installPiper(voice)}
                          disabled={!!downloading}
                          className="rounded border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground disabled:opacity-40"
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
