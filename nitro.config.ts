import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  routeRules: {
    "/**": {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },
    // Dedicated Workers are treated like a nested browsing context under COEP:
    // the worker script's own response must ALSO carry a Cross-Origin-Embedder-Policy
    // header (defaults to "unsafe-none" otherwise, which is incompatible with the
    // parent document's "require-corp" and gets the load blocked — Chrome reports
    // this as blockedReason "coep-frame-resource-needs-coep-header").
    // On Vercel, static assets under /assets/** are served by a routing rule that
    // doesn't inherit the "/**" rule's headers below, so pdf.js's render worker and
    // our storage worker were silently blocked in production only — the local Vite
    // dev server puts COOP/COEP on every response, including assets, so this never
    // reproduced there. Cross-Origin-Resource-Policy is included too since it's the
    // standard companion header for cross-origin-isolated static asset serving.
    "/assets/**": {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    },
  },
  rollupConfig: {
    external: ["pdfjs-dist"],
  },
});
