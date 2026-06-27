import type { ProviderFailureDebug } from "@/lib/shared/provider-error";
import type {
  VisionExtractionDebugSummary,
  VisionExtractionDraft,
} from "@/lib/vision-extraction/vision-extraction-types";

export interface VisionExtractionInput {
  image_base64: string;
  mime_type: "image/png" | "image/jpeg" | "image/webp";
  student_profile_summary: string;
}

export type VisionProviderErrorCode =
  | "model_not_configured"
  | "model_timeout"
  | "model_request_failed"
  | "model_invalid_output";

export interface VisionProviderError {
  code: VisionProviderErrorCode;
  message: string;
  recoverable: true;
  debug_summary?: VisionExtractionDebugSummary;
  provider_debug?: ProviderFailureDebug;
}

export type VisionProviderResult =
  | { ok: true; value: VisionExtractionDraft }
  | { ok: false; error: VisionProviderError };

export interface VisionExtractionProvider {
  extractQuestionFromImage(
    input: VisionExtractionInput,
  ): Promise<VisionProviderResult>;
}

export type VisionProviderProtocol = "anthropic" | "openai" | "glm_ocr";
export type VisionProviderImageFormat = "data_url" | "base64";

export interface VisionProviderConfig {
  protocol: VisionProviderProtocol;
  base_url: string;
  model: string;
  api_key: string;
  provider_name?: string;
  image_format: VisionProviderImageFormat;
  timeout_ms: number;
}
