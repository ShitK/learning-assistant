import { isRecord } from "@/lib/utils";
import type { DiagnoseErrorCode } from "@/lib/diagnose-api";
import type { VisionExtractionDraft } from "@/lib/vision-extraction-parser";

export interface AnalysisProviderConfig {
  protocol: "openai";
  base_url: string;
  model: string;
  api_key: string;
  provider_name: string;
  timeout_ms: number;
  fetch_fn?: typeof fetch;
}

export interface AnalysisEnhancementDraft {
  expected_diagnosis: string;
  step_analysis: string[];
  solution_highlights: string[];
  standard_solution: string;
  warnings: string[];
}

export interface AnalysisProvider {
  analyzeConfirmedExtraction(
    extraction: VisionExtractionDraft,
  ): Promise<AnalysisProviderResult>;
}

export type AnalysisProviderResult =
  | { ok: true; value: AnalysisEnhancementDraft }
  | { ok: false; error: AnalysisProviderError };

export interface AnalysisProviderError {
  code: DiagnoseErrorCode;
  message: string;
  recoverable: boolean;
  failure_kind:
    | "not_configured"
    | "http_error"
    | "invalid_json"
    | "invalid_output"
    | "network_failed"
    | "timeout";
  provider_name?: string;
  http_status?: number;
}

type AnalysisProviderConfigResult =
  | { ok: true; value: AnalysisProviderConfig }
  | { ok: false; error: AnalysisProviderError };

const DEFAULT_PROVIDER_NAME = "text_analysis_provider";
const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 120_000;

const ALLOWED_OUTPUT_KEYS = new Set([
  "expected_diagnosis",
  "step_analysis",
  "solution_highlights",
  "standard_solution",
  "warnings",
]);

export function createAnalysisProviderConfigFromEnv(
  env: NodeJS.ProcessEnv,
): AnalysisProviderConfigResult {
  const apiKey = env.ANALYSIS_PROVIDER_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: {
        code: "model_not_configured",
        message:
          "服务端未配置 ANALYSIS_PROVIDER_API_KEY，确认后文本分析增强将使用本地规则。",
        recoverable: true,
        failure_kind: "not_configured",
      },
    };
  }

  const protocol = env.ANALYSIS_PROVIDER_PROTOCOL?.trim() || "openai";
  if (protocol !== "openai") {
    return {
      ok: false,
      error: {
        code: "model_not_configured",
        message:
          "ANALYSIS_PROVIDER_PROTOCOL 当前仅支持 openai，确认后文本分析增强将使用本地规则。",
        recoverable: true,
        failure_kind: "not_configured",
      },
    };
  }

  return {
    ok: true,
    value: {
      protocol: "openai",
      base_url:
        env.ANALYSIS_PROVIDER_BASE_URL?.trim() || "https://api.deepseek.com",
      model: env.ANALYSIS_PROVIDER_MODEL?.trim() || "deepseek-v4-flash",
      api_key: apiKey,
      provider_name:
        env.ANALYSIS_PROVIDER_NAME?.trim() || DEFAULT_PROVIDER_NAME,
      timeout_ms: parseTimeoutMs(env.ANALYSIS_PROVIDER_TIMEOUT_MS),
    },
  };
}

export function createAnalysisProvider(
  config: AnalysisProviderConfig,
): AnalysisProvider {
  const fetchFn = config.fetch_fn ?? fetch;

  return {
    async analyzeConfirmedExtraction(
      extraction: VisionExtractionDraft,
    ): Promise<AnalysisProviderResult> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeout_ms);

      try {
        const response = await fetchFn(buildCompletionsUrl(config.base_url), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.api_key}`,
          },
          body: JSON.stringify(buildOpenAiRequestBody(config, extraction)),
          signal: controller.signal,
        });

        if (!response.ok) {
          return {
            ok: false,
            error: {
              code: "model_request_failed",
              message: "文本分析模型请求失败，已保留本地规则分析结果。",
              recoverable: true,
              failure_kind: "http_error",
              provider_name: config.provider_name,
              http_status: response.status,
            },
          };
        }

        const payload = (await response.json()) as unknown;
        const content = readOpenAiMessageContent(payload);
        if (!content.ok) {
          return {
            ok: false,
            error: {
              code: "model_invalid_output",
              message: content.message,
              recoverable: true,
              failure_kind: "invalid_output",
              provider_name: config.provider_name,
            },
          };
        }

        const parsed = parseAnalysisProviderOutput(content.value);
        if (!parsed.ok) {
          return {
            ok: false,
            error: {
              ...parsed.error,
              provider_name: config.provider_name,
            },
          };
        }

        return parsed;
      } catch (error) {
        const isTimeout =
          error instanceof DOMException && error.name === "AbortError";

        return {
          ok: false,
          error: {
            code: isTimeout ? "model_timeout" : "model_request_failed",
            message: isTimeout
              ? "文本分析模型请求超时，已保留本地规则分析结果。"
              : "文本分析模型网络请求失败，已保留本地规则分析结果。",
            recoverable: true,
            failure_kind: isTimeout ? "timeout" : "network_failed",
            provider_name: config.provider_name,
          },
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function parseAnalysisProviderOutput(text: string): AnalysisProviderResult {
  const jsonText = extractJsonObjectText(text);
  if (!jsonText) {
    return invalidJson("文本分析模型未返回 JSON 对象。");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return invalidJson("文本分析模型返回的 JSON 无法解析。");
  }

  if (!isRecord(parsed)) {
    return invalidOutput("文本分析模型返回值必须是对象。");
  }

  if (!hasOnlyAllowedOutputKeys(parsed)) {
    return invalidOutput("文本分析模型返回了未允许的字段。");
  }

  if (
    !isNonEmptyString(parsed.expected_diagnosis) ||
    !isStringArray(parsed.step_analysis) ||
    !isStringArray(parsed.solution_highlights) ||
    !isNonEmptyString(parsed.standard_solution)
  ) {
    return invalidOutput("文本分析模型返回字段不完整。");
  }

  const warnings = isStringArray(parsed.warnings) ? parsed.warnings : [];

  return {
    ok: true,
    value: {
      expected_diagnosis: parsed.expected_diagnosis.trim(),
      step_analysis: normalizeLines(parsed.step_analysis, 8),
      solution_highlights: normalizeLines(parsed.solution_highlights, 5),
      standard_solution: parsed.standard_solution.trim(),
      warnings: normalizeLines(warnings, 5),
    },
  };
}

function buildOpenAiRequestBody(
  config: AnalysisProviderConfig,
  extraction: VisionExtractionDraft,
): Record<string, unknown> {
  return {
    model: config.model,
    messages: [
      {
        role: "system",
        content: buildAnalysisSystemPrompt(),
      },
      {
        role: "user",
        content: buildAnalysisUserPrompt(extraction),
      },
    ],
    response_format: { type: "json_object" },
    stream: false,
  };
}

function buildAnalysisSystemPrompt(): string {
  return [
    "你是高中数学错题诊断文本分析助手。",
    "你只能基于用户已确认的题干、学生答案、学生步骤和标准解法草稿，增强报告表达。",
    "必须输出严格 json 对象，不要输出 markdown 解释文字。",
    "JSON 字段必须且只能包含 expected_diagnosis、step_analysis、solution_highlights、standard_solution、warnings。",
    "step_analysis、solution_highlights、warnings 必须是字符串数组。",
    "数学公式必须使用 $...$ 或 $$...$$ 包裹。",
    "包含 LaTeX 命令的表达式也必须整体包裹，例如把 \\frac{1}{a}、\\ln a、a\\leq 0 写成 $\\frac{1}{a}$、$\\ln a$、$a\\leq 0$。",
    "禁止输出 memory_delta、student_profile、mistake_history、knowledge_mastery_changes、mistake_cause_changes。",
    "不要判断是否写入长期画像；长期画像只由本地规则计算。",
  ].join("\n");
}

function buildAnalysisUserPrompt(extraction: VisionExtractionDraft): string {
  return [
    "请根据以下已确认错题信息输出 json：",
    `题干：${extraction.question_text}`,
    `学生答案：${extraction.student_answer}`,
    `学生步骤：${extraction.student_solution_steps.join("；")}`,
    `标准解法草稿：${extraction.standard_solution_draft}`,
    `识别置信度：${extraction.extraction_confidence}`,
    `已有提醒：${extraction.warnings.join("；") || "无"}`,
    'JSON 示例：{"expected_diagnosis":"...","step_analysis":["..."],"solution_highlights":["..."],"standard_solution":"...","warnings":[]}',
  ].join("\n");
}

function readOpenAiMessageContent(
  payload: unknown,
): { ok: true; value: string } | { ok: false; message: string } {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return { ok: false, message: "文本分析模型响应缺少 choices。" };
  }

  const choice = payload.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) {
    return { ok: false, message: "文本分析模型响应缺少 message。" };
  }

  if (!isNonEmptyString(choice.message.content)) {
    return { ok: false, message: "文本分析模型响应 content 为空。" };
  }

  return { ok: true, value: choice.message.content };
}

function buildCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function extractJsonObjectText(text: string): string | null {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const startIndex = text.indexOf("{");
  if (startIndex < 0) {
    return null;
  }

  let depth = 0;
  let isEscaped = false;
  let isInString = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (isInString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === '"') {
        isInString = false;
      }
      continue;
    }

    if (char === '"') {
      isInString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, index + 1).trim();
      }
    }
  }

  return null;
}

function invalidJson(message: string): AnalysisProviderResult {
  return {
    ok: false,
    error: {
      code: "model_invalid_output",
      message,
      recoverable: true,
      failure_kind: "invalid_json",
    },
  };
}

function invalidOutput(message: string): AnalysisProviderResult {
  return {
    ok: false,
    error: {
      code: "model_invalid_output",
      message,
      recoverable: true,
      failure_kind: "invalid_output",
    },
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeLines(lines: string[], maxCount: number): string[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, maxCount);
}

function hasOnlyAllowedOutputKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).every((key) => ALLOWED_OUTPUT_KEYS.has(key));
}

function parseTimeoutMs(value: string | undefined): number {
  const parsed = Number(value ?? "");
  if (!Number.isInteger(parsed)) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.min(Math.max(parsed, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}
