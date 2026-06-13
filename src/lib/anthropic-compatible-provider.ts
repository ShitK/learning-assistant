import {
  createVisionExtractionPrompt,
  parseVisionExtractionText,
} from "@/lib/vision-extraction-parser";
import { isRecord } from "@/lib/utils";
import type {
  VisionExtractionDebugSummary,
  VisionExtractionDraft,
} from "@/lib/vision-extraction-parser";
import type {
  ProviderFailureDebug,
  ProviderFailureKind,
} from "@/lib/provider-error";

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

export type VisionProviderProtocol = "anthropic" | "openai";
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

interface VisionProviderRuntimeConfig extends VisionProviderConfig {
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

const DEFAULT_LEGACY_BASE_URL =
  "https://token-plan-cn.xiaomimimo.com/anthropic";
const DEFAULT_LEGACY_MODEL = "mimo-v2.5";
const DEFAULT_TIMEOUT_MS = 15_000;
const MIN_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 120_000;
const DEFAULT_PROVIDER_NAME = "anthropic_compatible_vision";

export function createVisionProviderConfigFromEnv(
  env: Record<string, string | undefined>,
):
  | { ok: true; value: VisionProviderConfig }
  | { ok: false; error: VisionProviderError } {
  const apiKey = readFirstEnv(env, [
    "VISION_PROVIDER_API_KEY",
    "MIMO_API_KEY",
  ]);
  if (!apiKey) {
    return {
      ok: false,
      error: createProviderError(
        "model_not_configured",
        "服务端未配置 VISION_PROVIDER_API_KEY，无法进行图片诊断。旧的 MIMO_API_KEY 仍可作为本地兼容别名。",
      ),
    };
  }

  return {
    ok: true,
    value: {
      protocol: readProviderProtocol(env),
      base_url:
        readFirstEnv(env, ["VISION_PROVIDER_BASE_URL", "MIMO_BASE_URL"]) ||
        DEFAULT_LEGACY_BASE_URL,
      model:
        readFirstEnv(env, ["VISION_PROVIDER_MODEL", "MIMO_MODEL"]) ||
        DEFAULT_LEGACY_MODEL,
      api_key: apiKey,
      provider_name:
        readFirstEnv(env, ["VISION_PROVIDER_NAME"]) || DEFAULT_PROVIDER_NAME,
      image_format: readProviderImageFormat(env),
      timeout_ms: readTimeoutMs(env),
    },
  };
}

/**
 * @deprecated New code should call createVisionProvider. This compatibility
 * wrapper keeps older tests and imports working while the provider now supports
 * both Anthropic-compatible and OpenAI-compatible protocols.
 */
export function createAnthropicCompatibleVisionProvider(
  config: Omit<VisionProviderRuntimeConfig, "protocol" | "image_format"> & {
    protocol?: VisionProviderProtocol;
    image_format?: VisionProviderImageFormat;
  },
): VisionExtractionProvider {
  return createVisionProvider({
    ...config,
    protocol: config.protocol ?? "anthropic",
    image_format: config.image_format ?? "data_url",
  });
}

export function createVisionProvider(
  config: VisionProviderRuntimeConfig,
): VisionExtractionProvider {
  const fetchImpl = config.fetch_impl ?? fetch;
  const providerName = normalizeProviderName(config.provider_name);

  async function requestVisionExtraction(
    context: VisionExtractionRequestContext,
    signal: AbortSignal,
  ): Promise<InternalVisionProviderResult> {
    const response = await fetchImpl(buildProviderRequestUrl(config), {
      method: "POST",
      headers: buildProviderRequestHeaders(config),
      body: JSON.stringify(buildProviderRequestBody(config, context)),
      signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        error: createProviderError(
          "model_request_failed",
          `图片诊断模型服务返回 HTTP ${response.status}，请稍后重试。`,
          undefined,
          createProviderFailureDebug(providerName, {
            failure_kind: "http_error",
            http_status: response.status,
          }),
        ),
      };
    }

    const responsePayload = await readJsonResponse(response, providerName);
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
          undefined,
          createProviderFailureDebug(providerName, {
            failure_kind: "empty_text_content",
          }),
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
              "图片诊断模型请求超时，请稍后重试。",
              undefined,
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
            "图片诊断模型网络请求失败，请稍后重试。",
            undefined,
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

function joinAnthropicMessagesUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/v1/messages`;
}

function joinOpenAIChatCompletionsUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  return normalizedBaseUrl.endsWith("/chat/completions")
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/chat/completions`;
}

function buildProviderRequestUrl(config: VisionProviderRuntimeConfig): string {
  if (config.protocol === "openai") {
    return joinOpenAIChatCompletionsUrl(config.base_url);
  }

  return joinAnthropicMessagesUrl(config.base_url);
}

function buildProviderRequestHeaders(
  config: VisionProviderRuntimeConfig,
): Record<string, string> {
  if (config.protocol === "openai") {
    return {
      "content-type": "application/json",
      Authorization: `Bearer ${config.api_key}`,
    };
  }

  return {
    "content-type": "application/json",
    "x-api-key": config.api_key,
    "anthropic-version": "2023-06-01",
  };
}

function buildProviderRequestBody(
  config: VisionProviderRuntimeConfig,
  context: VisionExtractionRequestContext,
): Record<string, unknown> {
  const promptText = createVisionExtractionPromptText(context);
  const baseBody = {
    model: config.model,
    max_tokens: 1200,
    temperature: 0,
  };

  if (config.protocol === "openai") {
    return {
      ...baseBody,
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: buildOpenAIImageUrl(config, context.input),
              },
            },
            {
              type: "text",
              text: promptText,
            },
          ],
        },
      ],
    };
  }

  return {
    ...baseBody,
    thinking: {
      type: "disabled",
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: promptText,
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
  };
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
  providerDebug?: ProviderFailureDebug,
): VisionProviderError {
  return {
    code,
    message,
    recoverable: true,
    debug_summary: debugSummary,
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
  const debug: ProviderFailureDebug = {
    provider_name: providerName,
    provider_stage: "vision_llm",
    failure_kind: input.failure_kind,
  };

  return typeof input.http_status === "number"
    ? { ...debug, http_status: input.http_status }
    : debug;
}

function shouldRetryInvalidOutput(
  result: InternalVisionProviderResult,
): result is { ok: false; error: VisionProviderError; raw_output_text: string } {
  return (
    !result.ok &&
    result.error.code === "model_invalid_output" &&
    typeof result.raw_output_text === "string" &&
    result.raw_output_text.trim().length > 0 &&
    (result.error.debug_summary?.forbidden_fields.length ?? 0) === 0
  );
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
        "图片诊断模型响应不是合法 JSON，请稍后重试。",
        undefined,
        createProviderFailureDebug(providerName, {
          failure_kind: "invalid_json",
        }),
      ),
    };
  }
}

function normalizeProviderName(providerName: string | undefined): string {
  const normalized = providerName?.trim();
  return normalized || DEFAULT_PROVIDER_NAME;
}

function readFirstEnv(
  env: Record<string, string | undefined>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function readProviderProtocol(
  env: Record<string, string | undefined>,
): VisionProviderProtocol {
  return env.VISION_PROVIDER_PROTOCOL?.trim() === "openai"
    ? "openai"
    : "anthropic";
}

function readProviderImageFormat(
  env: Record<string, string | undefined>,
): VisionProviderImageFormat {
  return env.VISION_PROVIDER_IMAGE_FORMAT?.trim() === "base64"
    ? "base64"
    : "data_url";
}

function buildOpenAIImageUrl(
  config: VisionProviderRuntimeConfig,
  input: VisionExtractionInput,
): string {
  if (config.image_format === "base64") {
    return input.image_base64;
  }

  return `data:${input.mime_type};base64,${input.image_base64}`;
}

function readTimeoutMs(env: Record<string, string | undefined>): number {
  const rawTimeoutMs = env.VISION_PROVIDER_TIMEOUT_MS?.trim();
  if (!rawTimeoutMs) {
    return DEFAULT_TIMEOUT_MS;
  }

  const timeoutMs = Number(rawTimeoutMs);
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < MIN_TIMEOUT_MS ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    return DEFAULT_TIMEOUT_MS;
  }

  return timeoutMs;
}

function extractTextContent(value: unknown): string | null {
  const openAIText = extractOpenAITextContent(value);
  if (openAIText) {
    return openAIText;
  }

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

function extractOpenAITextContent(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    return null;
  }

  const textBlocks = value.choices
    .map((choice) => {
      if (!isRecord(choice) || !isRecord(choice.message)) {
        return "";
      }

      const content = choice.message.content;
      if (typeof content === "string") {
        return content;
      }

      if (!Array.isArray(content)) {
        return "";
      }

      return content
        .map((block) => {
          if (!isRecord(block) || block.type !== "text") {
            return "";
          }

          return typeof block.text === "string" ? block.text : "";
        })
        .filter((text) => text.trim().length > 0)
        .join("\n");
    })
    .filter((text) => text.trim().length > 0);

  return textBlocks.length > 0 ? textBlocks.join("\n").trim() : null;
}
