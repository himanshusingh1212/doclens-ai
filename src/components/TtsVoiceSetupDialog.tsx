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
} from "@/lib/tts";
import { setPiperReaderPlaybackRate } from "@/lib/piper-reader";

interface Props {
  open: boolean;
  language: string;
  onOpenChange: (open: boolean) => void;
  onReady?: () => void;
}

export function TtsVoiceSetupDialog({ open, language, onOpenChange, onReady }: Props) {
  const [piperVoices, setPiperVoices] = useState<PiperVoiceMeta[] | null>(null);
  const [installed, setInstalled] = useState<string[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [rate, setRateState] = useState(() => getTtsRate());
  const [pitch, setPitchState] = useState(() => getTtsPitch());

  useEffect(() => {
    if (open) {
      setRateState(getTtsRate());
      setPitchState(getTtsPitch());
    }
  }, [open]);

  const handleRateChange = (newRate: number) => {
    setRateState(newRate);
    setTtsRate(newRate);
    setPiperReaderPlaybackRate(newRate);
  };

  const handlePitchChange = (newPitch: number) => {
    setPitchState(newPitch);
    setTtsPitch(newPitch);
  };

  useEffect(() => {
    if (!open) return;
    void listInstalledPiperVoices()
      .then(setInstalled)
      .catch(() => setInstalled([]));
    void listPiperVoices()
      .then(setPiperVoices)
      .catch(() => {
        setPiperVoices([]);
        toast.error("Could not load Piper voice catalog.");
      });
  }, [open]);

  const code = langKey(language).split("-")[0].toLowerCase();

  const matchingPiperVoices = useMemo(() => {
    return (piperVoices ?? [])
      .filter((voice) => {
        return matchesPiperLanguage(voice, language, code);
      })
      .sort(
        (a, b) => qualityRank(a.quality) - qualityRank(b.quality) || a.name.localeCompare(b.name),
      )
      .slice(0, 12);
  }, [piperVoices, code, language]);

  const selectedPiper = getPreferredPiperVoice();

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
          <DialogTitle>Select a Piper voice for {language}</DialogTitle>
          <DialogDescription>
            Install or select a local Piper neural voice before playback starts.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-4">
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
                      <span
                        className={`h-3 w-3 rounded-full border ${selectedPiper === voice.key ? "border-primary bg-primary" : "border-border"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">
                          {voice.name}
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {voice.language.name_native} · {voice.quality} ·{" "}
                          {((voice.sizeBytes || 0) / 1e6).toFixed(1)} MB
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

          {/* Voice Tuning Section */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
              Voice Tuning
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Speed */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">Speed</span>
                  <span className="font-mono text-xs text-muted-foreground">
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
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground">Pitch</span>
                    <span className="text-[10px] text-muted-foreground/80">
                      (Browser legacy voice only)
                    </span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
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
