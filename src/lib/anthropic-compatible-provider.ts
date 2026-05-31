import {
  createVisionExtractionPrompt,
  parseVisionExtractionText,
} from "@/lib/vision-extraction-parser";
import { isRecord } from "@/lib/utils";
import type {
  VisionExtractionDebugSummary,
  VisionExtractionDraft,
} from "@/lib/vision-extraction-parser";

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
}

export type VisionProviderResult =
  | { ok: true; value: VisionExtractionDraft }
  | { ok: false; error: VisionProviderError };

export interface VisionExtractionProvider {
  extractQuestionFromImage(
    input: VisionExtractionInput,
  ): Promise<VisionProviderResult>;
}

export interface MimoProviderConfig {
  base_url: string;
  model: string;
  api_key: string;
  timeout_ms: number;
}

interface AnthropicCompatibleProviderConfig extends MimoProviderConfig {
  fetch_impl?: typeof fetch;
}

const DEFAULT_MIMO_BASE_URL =
  "https://token-plan-cn.xiaomimimo.com/anthropic";
const DEFAULT_MIMO_MODEL = "mimo-v2.5";
const DEFAULT_TIMEOUT_MS = 15_000;

export function createMimoProviderConfigFromEnv(
  env: Record<string, string | undefined>,
):
  | { ok: true; value: MimoProviderConfig }
  | { ok: false; error: VisionProviderError } {
  const apiKey = env.MIMO_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: createProviderError(
        "model_not_configured",
        "服务端未配置 MIMO_API_KEY，无法进行图片诊断。",
      ),
    };
  }

  return {
    ok: true,
    value: {
      base_url: env.MIMO_BASE_URL?.trim() || DEFAULT_MIMO_BASE_URL,
      model: env.MIMO_MODEL?.trim() || DEFAULT_MIMO_MODEL,
      api_key: apiKey,
      timeout_ms: DEFAULT_TIMEOUT_MS,
    },
  };
}

export function createAnthropicCompatibleVisionProvider(
  config: AnthropicCompatibleProviderConfig,
): VisionExtractionProvider {
  const fetchImpl = config.fetch_impl ?? fetch;

  return {
    async extractQuestionFromImage(
      input: VisionExtractionInput,
    ): Promise<VisionProviderResult> {
      const abortController = new AbortController();
      const timeout = setTimeout(() => {
        abortController.abort(new DOMException("timeout", "TimeoutError"));
      }, config.timeout_ms);

      try {
        const response = await fetchImpl(joinAnthropicMessagesUrl(config.base_url), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": config.api_key,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: config.model,
            max_tokens: 1200,
            temperature: 0,
            thinking: {
              type: "disabled",
            },
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: createVisionExtractionPrompt({
                      student_profile_summary: input.student_profile_summary,
                    }),
                  },
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: input.mime_type,
                      data: input.image_base64,
                    },
                  },
                ],
              },
            ],
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          return {
            ok: false,
            error: createProviderError(
              "model_request_failed",
              `MiMo 图片诊断请求失败，HTTP ${response.status}。`,
            ),
          };
        }

        const responsePayload = await readJsonResponse(response);
        if (!responsePayload.ok) {
          return responsePayload;
        }

        const outputText = extractTextContent(responsePayload.value);
        if (!outputText) {
          return {
            ok: false,
            error: createProviderError(
              "model_invalid_output",
              "模型响应中没有可解析的文本内容。",
            ),
          };
        }

        const parsed = parseVisionExtractionText(outputText);
        if (!parsed.ok) {
          return {
            ok: false,
            error: parsed.error,
          };
        }

        return {
          ok: true,
          value: parsed.value,
        };
      } catch {
        if (abortController.signal.aborted) {
          return {
            ok: false,
            error: createProviderError(
              "model_timeout",
              "MiMo 图片诊断请求超时，请稍后重试。",
            ),
          };
        }

        return {
          ok: false,
          error: createProviderError(
            "model_request_failed",
            "MiMo 图片诊断请求失败，请稍后重试。",
          ),
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function joinAnthropicMessagesUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/v1/messages`;
}

function createProviderError(
  code: VisionProviderErrorCode,
  message: string,
  debugSummary?: VisionExtractionDebugSummary,
): VisionProviderError {
  return {
    code,
    message,
    recoverable: true,
    debug_summary: debugSummary,
  };
}

async function readJsonResponse(
  response: Response,
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
        "MiMo 图片诊断响应不是合法 JSON。",
      ),
    };
  }
}

function extractTextContent(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.content)) {
    return null;
  }

  const textBlocks = value.content
    .map((block) => {
      if (!isRecord(block) || block.type !== "text") {
        return "";
      }

      return typeof block.text === "string" ? block.text : "";
    })
    .filter((text) => text.trim().length > 0);

  if (textBlocks.length === 0) {
    return null;
  }

  return textBlocks.join("\n").trim();
}
