import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getKeyStatus,
  OPEN_API_KEY_MODAL_EVT,
  onKeyChange,
  validateKey,
  type KeyStatus,
} from "@/lib/openrouter";

type Status = KeyStatus | "checking";

/**
 * Globally-mounted (in __root.tsx) modal that other UI can request via the
 * `doclens:open-api-key-modal` window event. Handles paste → validate → save
 * in one place so every entry point shares the same UX.
 */
export function ApiKeyModal() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("unknown");

  // Listen for global open requests.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ reason?: string }>).detail;
      setReason(detail?.reason ?? null);
      setStatus(getKeyStatus());
      setOpen(true);
    };
    window.addEventListener(OPEN_API_KEY_MODAL_EVT, handler);
    return () => window.removeEventListener(OPEN_API_KEY_MODAL_EVT, handler);
  }, []);

  // Reflect external changes (e.g. saved from Settings).
  useEffect(() => onKeyChange(() => setStatus(getKeyStatus())), []);

  const handleValidate = async () => {
    setStatus("checking");
    const ok = await validateKey();
    if (ok) {
      setStatus("valid");
      toast.success("Server OpenRouter key is configured.");
      setOpen(false);
    } else {
      const nextStatus = getKeyStatus();
      setStatus(nextStatus === "missing" ? "missing" : "invalid");
      toast.error(
        nextStatus === "missing"
          ? "OPENROUTER_API_KEY is not configured on the server."
          : "OpenRouter rejected the server key.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>OpenRouter environment key</DialogTitle>
          <DialogDescription>
            DocLens reads OPENROUTER_API_KEY on the server. The browser never
            receives the key.
          </DialogDescription>
        </DialogHeader>

        {reason && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[11px] text-destructive">
            {reason}
          </div>
        )}

        <div className="rounded-md border border-border bg-background px-3 py-2">
          <StatusLine status={status} />
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] uppercase tracking-widest text-primary underline-offset-4 hover:underline"
          >
            get an api key →
          </a>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpen(false)}
              className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              cancel
            </button>
            <button
              onClick={handleValidate}
              disabled={status === "checking"}
              className="rounded-md bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground disabled:opacity-40"
            >
              {status === "checking" ? "checking…" : "check server key"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (status === "checking")
    return <p className="font-mono text-[11px] text-muted-foreground">checking server environment…</p>;
  if (status === "valid")
    return <p className="font-mono text-[11px] text-primary">connected - server key is valid</p>;
  if (status === "missing")
    return (
      <p className="font-mono text-[11px] text-destructive">
        missing OPENROUTER_API_KEY on the server
      </p>
    );
  if (status === "invalid")
    return (
      <p className="font-mono text-[11px] text-destructive">
        server key is invalid or expired
      </p>
    );
  return <p className="font-mono text-[11px] text-muted-foreground">server key not checked yet</p>;
}
