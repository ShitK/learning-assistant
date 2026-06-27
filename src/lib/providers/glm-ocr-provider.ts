import type {
  VisionExtractionProvider,
  VisionProviderConfig,
} from "@/lib/providers/anthropic-compatible-provider";

interface GlmOcrRuntimeConfig extends VisionProviderConfig {
  fetch_impl?: typeof fetch;
}

export function createGlmOcrVisionProvider(
  _config: GlmOcrRuntimeConfig,
): VisionExtractionProvider {
  return {
    async extractQuestionFromImage() {
      return {
        ok: false,
        error: {
          code: "model_request_failed",
          message: "GLM-OCR provider 尚未完成实现。",
          recoverable: true,
        },
      };
    },
  };
}
