import type {
  VisionExtractionInput,
  VisionExtractionProvider,
  VisionProviderConfig,
  VisionProviderError,
  VisionProviderResult,
} from "@/lib/providers/anthropic-compatible-provider";
import { parseGlmOcrResponse } from "@/lib/providers/glm-ocr-response-parser";
import type { ProviderFailureDebug, ProviderFailureKind } from "@/lib/shared/provider-error";
import { mapGlmOcrContentToDraft } from "@/lib/vision-extraction/glm-ocr-draft-mapper";

interface GlmOcrRuntimeConfig extends VisionProviderConfig {
  fetch_impl?: typeof fetch;
}

const MAX_GLM_OCR_IMAGE_BYTES = 10 * 1024 * 1024;

export function createGlmOcrVisionProvider(
  config: GlmOcrRuntimeConfig,
): VisionExtractionProvider {
  const fetchImpl = config.fetch_impl ?? fetch;
  const providerName = normalizeProviderName(config.provider_name);

  return {
    async extractQuestionFromImage(
      input: VisionExtractionInput,
    ): Promise<VisionProviderResult> {
      const imageSize = estimateBase64Bytes(input.image_base64);
      if (imageSize > MAX_GLM_OCR_IMAGE_BYTES) {
        return {
          ok: false,
          error: createProviderError(
            "model_request_failed",
            "上传图片超过 GLM-OCR 单图 10MB 限制，请压缩后重试。",
          ),
        };
      }

      const abortController = new AbortController();
      const timeout = setTimeout(() => {
        abortController.abort(new DOMException("timeout", "TimeoutError"));
      }, config.timeout_ms);

      try {
        const response = await fetchImpl(joinGlmOcrLayoutParsingUrl(config.base_url), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${config.api_key}`,
          },
          body: JSON.stringify(buildGlmOcrRequestBody(config, input)),
          signal: abortController.signal,
        });

        if (!response.ok) {
          return {
            ok: false,
            error: createProviderError(
              "model_request_failed",
              `GLM-OCR 服务返回 HTTP ${response.status}，请稍后重试。`,
              createProviderFailureDebug(providerName, {
                failure_kind: "http_error",
                http_status: response.status,
              }),
            ),
          };
        }

        const payload = await readJsonResponse(response, providerName);
        if (!payload.ok) {
          return payload;
        }

        const parsed = parseGlmOcrResponse(payload.value);
        if (!parsed.ok) {
          return {
            ok: false,
            error: createProviderError(
              parsed.failure_kind === "empty_text_content"
                ? "model_invalid_output"
                : "model_request_failed",
              parsed.failure_kind === "empty_text_content"
                ? "GLM-OCR 响应中没有可解析的文本内容。"
                : "GLM-OCR 响应包含错误信息，请稍后重试。",
              createProviderFailureDebug(providerName, {
                failure_kind: parsed.failure_kind,
              }),
            ),
          };
        }

        return {
          ok: true,
          value: mapGlmOcrContentToDraft(parsed.value),
        };
      } catch {
        if (abortController.signal.aborted) {
          return {
            ok: false,
            error: createProviderError(
              "model_timeout",
              "GLM-OCR 请求超时，请稍后重试。",
              createProviderFailureDebug(providerName, {
                failure_kind: "timeout",
              }),
            ),
          };
        }

        return {
          ok: false,
          error: createProviderError(
            "model_request_failed",
            "GLM-OCR 网络请求失败，请稍后重试。",
            createProviderFailureDebug(providerName, {
              failure_kind: "network_failed",
            }),
          ),
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function joinGlmOcrLayoutParsingUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  return normalizedBaseUrl.endsWith("/layout_parsing")
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/layout_parsing`;
}

function buildGlmOcrRequestBody(
  config: GlmOcrRuntimeConfig,
  input: VisionExtractionInput,
): Record<string, unknown> {
  return {
    model: config.model,
    file:
      config.image_format === "base64"
        ? input.image_base64
        : `data:${input.mime_type};base64,${input.image_base64}`,
    return_crop_images: false,
    need_layout_visualization: false,
  };
}

async function readJsonResponse(
  response: Response,
  providerName: string,
): Promise<{ ok: true; value: unknown } | { ok: false; error: VisionProviderError }> {
  try {
    return {
      ok: true,
      value: await response.json(),
    };
  } catch {
    return {
      ok: false,
      error: createProviderError(
        "model_request_failed",
        "GLM-OCR 响应不是合法 JSON，请稍后重试。",
        createProviderFailureDebug(providerName, {
          failure_kind: "invalid_json",
        }),
      ),
    };
  }
}

function createProviderError(
  code: VisionProviderError["code"],
  message: string,
  providerDebug?: ProviderFailureDebug,
): VisionProviderError {
  return {
    code,
    message,
    recoverable: true,
    provider_debug: providerDebug,
  };
}

function createProviderFailureDebug(
  providerName: string,
  input: {
    failure_kind: ProviderFailureKind;
    http_status?: number;
  },
): ProviderFailureDebug {
  return typeof input.http_status === "number"
    ? {
        provider_name: providerName,
        provider_stage: "ocr",
        failure_kind: input.failure_kind,
        http_status: input.http_status,
      }
    : {
        provider_name: providerName,
        provider_stage: "ocr",
        failure_kind: input.failure_kind,
      };
}

function normalizeProviderName(providerName: string | undefined): string {
  const normalized = providerName?.trim();
  return normalized || "glm_ocr";
}

function estimateBase64Bytes(value: string): number {
  const normalized = value.replace(/^data:[^,]+,/, "").replace(/\s/g, "");
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}
