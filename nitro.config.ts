import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({

  rollupConfig: {
    external: [
      "piper-tts-web",
      "@huggingface/transformers",
      "onnxruntime-web",
      "pdfjs-dist",
    ],
  },
});
