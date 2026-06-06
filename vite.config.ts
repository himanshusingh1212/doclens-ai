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
  cloudflare: false,
  tanstackStart: {
    spa: {},
    prerender: {
      enabled: false,
    },
  },
  vite: {
    ssr: {
      external: [
        "piper-tts-web",
        "@huggingface/transformers",
        "onnxruntime-web",
        "lucide-react",
        "pdfjs-dist",
      ],
    },
    environments: {
      nitro: {
        resolve: {
          external: [
            "piper-tts-web",
            "@huggingface/transformers",
            "onnxruntime-web",
            "lucide-react",
            "pdfjs-dist",
          ],
        },
      },
    },
    build: {
      minify: false,
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
            external: [
              "piper-tts-web",
              "@huggingface/transformers",
              "onnxruntime-web",
              "lucide-react",
              "pdfjs-dist",
            ],
          },
        }),
      ]
    : [],
});
