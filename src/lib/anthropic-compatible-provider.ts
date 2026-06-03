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

interface VisionExtractionRequestContext {
  input: VisionExtractionInput;
  repair?: {
    previous_output: string;
    error_message: string;
  };
}

type InternalVisionProviderResult =
  | { ok: true; value: VisionExtractionDraft }
  | { ok: false; error: VisionProviderError; raw_output_text?: string };

const DEFAULT_MIMO_BASE_URL =
  "https://token-plan-cn.xiaomimimo.com/anthropic";
const DEFAULT_MIMO_MODEL = "mimo-v2.5";
const DEFAULT_TIMEOUT_MS = 15_000;
const FORBIDDEN_OUTPUT_KEY_PATTERN =
  /["']?(?:memory_delta|student_profile|mistake_history|knowledge_mastery_changes|mistake_cause_changes)["']?\s*:/;

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

  async function requestVisionExtraction(
    context: VisionExtractionRequestContext,
    signal: AbortSignal,
  ): Promise<InternalVisionProviderResult> {
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
                text: createVisionExtractionPromptText(context),
              },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: context.input.mime_type,
                  data: context.input.image_base64,
                },
              },
            ],
          },
        ],
      }),
      signal,
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
        raw_output_text: outputText,
      };
    }

    return {
      ok: true,
      value: parsed.value,
    };
  }

  return {
    async extractQuestionFromImage(
      input: VisionExtractionInput,
    ): Promise<VisionProviderResult> {
      const abortController = new AbortController();
      const timeout = setTimeout(() => {
        abortController.abort(new DOMException("timeout", "TimeoutError"));
      }, config.timeout_ms);

      try {
        const firstAttempt = await requestVisionExtraction(
          { input },
          abortController.signal,
        );
        if (firstAttempt.ok) {
          return firstAttempt;
        }

        if (!shouldRetryInvalidOutput(firstAttempt)) {
          return toPublicProviderResult(firstAttempt);
        }

        const retryAttempt = await requestVisionExtraction(
          {
            input,
            repair: {
              previous_output: firstAttempt.raw_output_text,
              error_message: firstAttempt.error.message,
            },
          },
          abortController.signal,
        );

        return retryAttempt.ok
          ? retryAttempt
          : toPublicProviderResult(firstAttempt);
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

function createVisionExtractionPromptText(
  context: VisionExtractionRequestContext,
): string {
  const basePrompt = createVisionExtractionPrompt({
    student_profile_summary: context.input.student_profile_summary,
  });

  if (!context.repair) {
    return basePrompt;
  }

  return [
    basePrompt,
    "上一次模型输出未通过校验，请重新阅读图片并只输出修正后的合法 JSON。",
    `校验错误：${context.repair.error_message}`,
    "修正要求：补齐缺失字段；把 student_solution_steps 和 warnings 输出为字符串数组；不要输出任何画像、memory_delta 或解释文字。",
    "上一次输出仅供你理解错误类型，不能原样照抄：",
    context.repair.previous_output,
  ].join("\n");
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

function shouldRetryInvalidOutput(
  result: InternalVisionProviderResult,
): result is { ok: false; error: VisionProviderError; raw_output_text: string } {
  return (
    !result.ok &&
    result.error.code === "model_invalid_output" &&
    typeof result.raw_output_text === "string" &&
    result.raw_output_text.trim().length > 0 &&
    !hasRawForbiddenOutputKey(result.raw_output_text) &&
    (result.error.debug_summary?.forbidden_fields.length ?? 0) === 0
  );
}

function hasRawForbiddenOutputKey(rawOutputText: string): boolean {
  return FORBIDDEN_OUTPUT_KEY_PATTERN.test(rawOutputText);
}

function toPublicProviderResult(
  result: InternalVisionProviderResult,
): VisionProviderResult {
  if (result.ok) {
    return result;
  }

  return {
    ok: false,
    error: result.error,
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
