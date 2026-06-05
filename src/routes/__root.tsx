import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { ApiKeyModal } from "@/components/ApiKeyModal";
import { Toaster } from "@/components/ui/sonner";
import { useEffect } from "react";
import { initTheme } from "@/lib/theme";


import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Anuwad — Private PDF Reader, Translator & AI Voice Reader" },
      {
        name: "description",
        content:
          "Anuwad is a free, private, browser-only PDF reader with AI translation, neural text-to-speech, and document pipeline inspection. Nothing leaves your device.",
      },
      {
        name: "keywords",
        content:
          "Anuwad, DocLens AI, private PDF reader, browser PDF translator, local text to speech, neural TTS PDF, PDF pipeline inspector, offline PDF reader, AI document reader",
      },
      { name: "author", content: "Anuwad" },
      { property: "og:site_name", content: "Anuwad" },
      { property: "og:title", content: "Anuwad — Private PDF Reader, Translator & AI Voice Reader" },
      {
        property: "og:description",
        content:
          "Free, browser-only PDF reader with AI translation and neural text-to-speech. 100% local — nothing leaves your device.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://www.anuwad.com/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Anuwad — Private PDF Reader, Translator & AI Voice Reader" },
      {
        name: "twitter:description",
        content:
          "Free, browser-only PDF reader with AI translation and neural text-to-speech. 100% local — nothing leaves your device.",
      },
    ],
    links: [
      { rel: "canonical", href: "https://www.anuwad.com/" },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  ssr: false,
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
function RootComponent() {
  useEffect(() => {
    initTheme();
  }, []);

  return (
    <>
      <Outlet />
      <ApiKeyModal />
      <Analytics />
      <SpeedInsights />
      <Toaster position="bottom-right" richColors closeButton />
    </>
  );
}
