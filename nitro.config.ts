import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  routeRules: {
    "/**": {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },
  },
  rollupConfig: {
    external: [
      "piper-tts-web",
      "@huggingface/transformers",
      "onnxruntime-web",
      "pdfjs-dist",
    ],
  },
});
