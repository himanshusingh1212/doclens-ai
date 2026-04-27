import { useEffect, useMemo, useRef } from "react";

interface Props {
  data: ArrayBuffer | null;
}

/**
 * Native browser PDF viewer.
 * Creates a Blob URL from the ArrayBuffer and renders it in an <object>,
 * letting the browser's built-in PDF viewer handle rendering, scrolling,
 * zoom, search, and print — just like opening a PDF normally.
 */
export function PdfViewer({ data }: Props) {
  const blobUrlRef = useRef<string | null>(null);

  // Create a Blob URL from the ArrayBuffer
  const pdfUrl = useMemo(() => {
    // Revoke previous URL to prevent memory leaks
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    if (!data) return null;
    const blob = new Blob([data], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    return url;
  }, [data]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="font-mono text-xs uppercase tracking-widest">no document loaded</div>
          <div className="mt-2 text-sm">Upload a PDF to begin</div>
        </div>
      </div>
    );
  }

  return (
    <object
      data={pdfUrl ?? undefined}
      type="application/pdf"
      className="h-full w-full"
      style={{ background: "#525659" }}
    >
      {/* Fallback for browsers that can't render PDF inline */}
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <div className="font-mono text-xs uppercase tracking-widest">
          pdf preview not available
        </div>
        <p className="max-w-sm text-center text-sm">
          Your browser does not support inline PDF viewing.
        </p>
        {pdfUrl && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-primary px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-primary-foreground transition-opacity hover:opacity-90"
          >
            open pdf in new tab
          </a>
        )}
      </div>
    </object>
  );
}
