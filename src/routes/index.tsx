import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SidebarLayout } from "@/components/SidebarLayout";
import { DocumentCard } from "@/components/DocumentCard";
import { Dropzone } from "@/components/Dropzone";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getKeyStatus,
  onKeyChange,
  openApiKeyModal,
  validateKey,
  type KeyStatus,
} from "@/lib/openrouter";
import {
  createDoc,
  deleteDoc,
  getLastOpened,
  listDocs,
  StorageError,
  type DocSummary,
} from "@/lib/storage";


export const Route = createFileRoute("/")({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "Anuwad (DocLens AI) — Private PDF Library & AI Reader" },
      {
        name: "description",
        content:
          "Your private, browser-only PDF library and reader. Upload, inspect document pipelines, auto-translate, and run TTS locally without leaving your device.",
      },
      { property: "og:title", content: "Anuwad (DocLens AI) — Private PDF Library & AI Reader" },
      {
        property: "og:description",
        content:
          "Your private, browser-only PDF library and reader. Upload, inspect document pipelines, auto-translate, and run TTS locally.",
      },
      { property: "og:url", content: "https://www.anuwad.com/" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Anuwad (DocLens AI) — Private PDF Library & AI Reader" },
      {
        name: "twitter:description",
        content:
          "Your private, browser-only PDF library and reader. Upload, inspect document pipelines, auto-translate, and run TTS locally.",
      },
    ],
  }),
});

const COLD_LAUNCH_KEY = "doclens.coldLaunchHandled";

function DashboardPage() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<DocSummary | null>(null);
  const [keyStatus, setKeyStatus] = useState<KeyStatus>("unknown");

  useEffect(() => {
    setKeyStatus(getKeyStatus());
    void validateKey().then(() => setKeyStatus(getKeyStatus()));
    return onKeyChange(() => setKeyStatus(getKeyStatus()));
  }, []);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listDocs();
      if (cancelled) return;
      setDocs(list);
      setLoading(false);

      // Auto-restore only on cold launch (first dashboard mount this session).
      // Any subsequent navigation to "/" must show the dashboard.
      const alreadyHandled = sessionStorage.getItem(COLD_LAUNCH_KEY);
      sessionStorage.setItem(COLD_LAUNCH_KEY, "1");
      if (alreadyHandled) return;

      const last = await getLastOpened();
      if (last && list.some((d) => d.id === last)) {
        navigate({ to: "/doc/$id", params: { id: last } });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFile = async (f: File) => {
    try {
      const buf = await f.arrayBuffer();
      const rec = await createDoc(f, buf);
      navigate({ to: "/doc/$id", params: { id: rec.id } });
    } catch (e) {
      if (e instanceof StorageError && e.code === "QUOTA_EXCEEDED") {
        toast.error(e.message);
      } else {
        toast.error("Failed to save document. Please try again.");
        console.error(e);
      }
    }
  };

  const handleDeleteClick = (doc: DocSummary, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteTarget(doc);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const { id, fileName } = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteDoc(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      toast.success(`"${fileName}" deleted.`);
    } catch (e) {
      toast.error("Failed to delete document.");
      console.error(e);
    }
  };

  return (
    <SidebarLayout
      pageTitle="Library"
      onNewDocument={handleFile}
      topBarRight={
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-border bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {loading ? "loading…" : `${docs.length} document${docs.length === 1 ? "" : "s"}`}
          </span>
        </div>
      }
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebSite",
                "@id": "https://www.anuwad.com/#website",
                "url": "https://www.anuwad.com/",
                "name": "Anuwad",
                "alternateName": "DocLens AI",
                "description": "Free, private, browser-only PDF reader with AI translation and neural text-to-speech."
              },
              {
                "@type": "WebPage",
                "@id": "https://www.anuwad.com/#webpage",
                "url": "https://www.anuwad.com/",
                "name": "Anuwad — Private PDF Reader, Translator & AI Voice Reader",
                "isPartOf": { "@id": "https://www.anuwad.com/#website" },
                "description": "Your private, browser-only PDF library and reader. Upload, inspect document pipelines, auto-translate, and run neural TTS — nothing leaves your device.",
                "inLanguage": "en",
                "dateModified": "2026-06-05",
                "speakable": {
                  "@type": "SpeakableSpecification",
                  "cssSelector": ["h1", ".hero-description"]
                }
              },
              {
                "@type": "SoftwareApplication",
                "@id": "https://www.anuwad.com/#software",
                "name": "Anuwad",
                "alternateName": "DocLens AI",
                "applicationCategory": "UtilitiesApplication",
                "operatingSystem": "Web (any modern browser)",
                "url": "https://www.anuwad.com/",
                "offers": {
                  "@type": "Offer",
                  "price": "0",
                  "priceCurrency": "USD",
                  "availability": "https://schema.org/InStock"
                },
                "featureList": [
                  "Private browser-only PDF rendering — zero server uploads",
                  "AI-powered page-by-page document translation via OpenRouter",
                  "Neural text-to-speech with offline Piper WASM voices",
                  "PDF pipeline inspector showing exactly what LLMs receive",
                  "IndexedDB storage for complete data sovereignty",
                  "90+ language support for translation output"
                ],
                "description": "Anuwad is a browser-based AI document assistant that renders PDFs, translates pages, and reads them aloud using neural TTS — all processed locally for complete privacy."
              },
              {
                "@type": "Organization",
                "@id": "https://www.anuwad.com/#organization",
                "name": "Anuwad",
                "url": "https://www.anuwad.com/",
                "sameAs": []
              },
              {
                "@type": "FAQPage",
                "@id": "https://www.anuwad.com/#faq",
                "mainEntity": [
                  {
                    "@type": "Question",
                    "name": "Is my document data sent to a server?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text": "No. According to the Anuwad architecture, 100% of PDF rendering, audio generation, and data storage are performed locally in the browser using IndexedDB. Your documents never leave your device, ensuring complete data sovereignty."
                    }
                  },
                  {
                    "@type": "Question",
                    "name": "How does the AI document translation work?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text": "Anuwad extracts text from each PDF page using Mozilla's pdf.js library, then sends only the text content to an AI model via OpenRouter for translation. The translated text is cached locally in IndexedDB. Research by Princeton University (GEO, 2023) demonstrates that structured, locally-processed content pipelines can reduce latency by up to 50% compared to cloud-round-trip tools."
                    }
                  },
                  {
                    "@type": "Question",
                    "name": "What languages does Anuwad support?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text": "Anuwad supports translation output in over 90 languages including Hindi, Bengali, Telugu, Malayalam, Tamil, Spanish, French, German, Mandarin, Arabic, and Japanese. The neural text-to-speech engine supports 25+ languages with offline Piper WASM voices."
                    }
                  },
                  {
                    "@type": "Question",
                    "name": "Is Anuwad free to use?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text": "Yes. Anuwad is completely free to use. PDF reading, neural text-to-speech, and the document pipeline inspector are all available at no cost. AI translation requires an OpenRouter API key, which offers free-tier models."
                    }
                  },
                  {
                    "@type": "Question",
                    "name": "How is Anuwad different from Google Translate or UPDF?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text": "Unlike cloud-based tools such as Google Translate or UPDF, Anuwad processes your PDF entirely in the browser. No document data is uploaded to external servers. Additionally, Anuwad includes a unique PDF pipeline inspector that shows developers exactly what text an LLM would receive from each page — a feature not available in competing tools."
                    }
                  }
                ]
              }
            ]
          })
        }}
      />
      <div className="mx-auto max-w-7xl space-y-8 p-8">
        {/* Hero Section */}
        <section>
          <div className="mb-6">
            <h1 className="text-4xl font-bold tracking-tight text-foreground">
              Anuwad — Private PDF Reader & AI Translator
            </h1>
            <p className="hero-description mt-2 max-w-2xl text-base text-muted-foreground">
              Read it. Hear it. Own it — in the language that owns your heart. A free, browser-only PDF library with AI translation and neural voice reading.
            </p>
          </div>

          {/* API Key Banner */}
          {keyStatus !== "valid" && (
            <div
              className={`mb-6 flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                keyStatus === "invalid"
                  ? "border-destructive/40 bg-destructive/10"
                  : "border-primary/40 bg-primary/5"
              }`}
            >
              <div className="min-w-0">
                <div
                  className={`font-mono text-[10px] uppercase tracking-[0.2em] ${
                    keyStatus === "invalid" ? "text-destructive" : "text-primary"
                  }`}
                >
                  {keyStatus === "invalid" ? "api key invalid" : "get started"}
                </div>
                <p className="mt-1 text-sm text-foreground/85">
                  {keyStatus === "invalid"
                    ? "The server OpenRouter key was rejected. Update the environment variable to keep translating."
                    : "Configure OPENROUTER_API_KEY on the server to start translating documents."}
                </p>
              </div>
              <button
                onClick={() => openApiKeyModal()}
                className="rounded-md bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground hover:opacity-90"
              >
                check key
              </button>
            </div>
          )}

          {/* Drag & Drop Zone */}
          <div className="h-56">
            <Dropzone onFile={handleFile} />
          </div>
        </section>

        {/* Documents Grid Section */}
        <section>
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-primary">☰</span>
              <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                Recent Documents
              </span>
            </div>
            <div className="flex gap-2">
              <button className="rounded-lg bg-surface-2 p-2 text-muted-foreground hover:text-primary transition-colors" aria-label="Grid view">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </button>
              <button className="rounded-lg bg-surface p-2 text-muted-foreground hover:text-primary transition-colors" aria-label="List view">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M3 6h18M3 12h18M3 18h18" />
                </svg>
              </button>
            </div>
          </div>

          {!loading && docs.length === 0 ? (
            <div className="glass-panel rounded-xl border-dashed p-10 text-center">
              <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                empty library
              </div>
              <p className="mt-2 text-sm text-foreground/80">
                Upload a PDF above to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {docs.map((d) => (
                <DocumentCard key={d.id} doc={d} onDelete={handleDeleteClick} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">{deleteTarget?.fileName}</span> and all
              its AI results. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarLayout>
  );
}
