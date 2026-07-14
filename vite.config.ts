// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

const isVercel = process.env.VERCEL === "1";

export default defineConfig({
  nitro: false,
  tanstackStart: {
    spa: {},
    prerender: {
      enabled: false,
    },
  },
  vite: {
    server: {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },
    optimizeDeps: {
      exclude: ["@sqlite.org/sqlite-wasm"],
    },
    ssr: {
      external: ["pdfjs-dist"],
    },
    environments: {
      nitro: {
        resolve: {
          external: ["pdfjs-dist"],
        },
      },
    },
  },
  plugins: isVercel
    ? [
        nitro({
          vercel: {
            functions: {
              runtime: "nodejs22.x",
            },
          },
          rollupConfig: {
            external: ["pdfjs-dist"],
          },
        }),
      ]
    : [],
});
