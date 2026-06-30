export interface EmbeddingProviderConfig {
  protocol: "openai";
  base_url: string;
  model: string;
  api_key: string;
  provider_name: string;
  timeout_ms: number;
  dimensions: 1536;
  fetch_fn?: typeof fetch;
}

export type EmbeddingProviderConfigResult =
  | { ok: true; value: EmbeddingProviderConfig }
  | { ok: false; error: EmbeddingProviderError };

export interface EmbeddingProviderValue {
  embedding: number[];
  model: string;
  provider_name: string;
  dimensions: 1536;
}

export type EmbeddingProviderResult =
  | { ok: true; value: EmbeddingProviderValue }
  | { ok: false; error: EmbeddingProviderError };

export interface EmbeddingProviderError {
  code:
    | "model_not_configured"
    | "model_request_failed"
    | "model_timeout"
    | "model_invalid_output";
  message: string;
  recoverable: true;
  failure_kind:
    | "not_configured"
    | "http_error"
    | "network_failed"
    | "timeout"
    | "invalid_json"
    | "invalid_output";
  provider_name?: string;
  http_status?: number;
}

export interface EmbeddingProvider {
  embedText(input: { text: string }): Promise<EmbeddingProviderResult>;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_PROVIDER_NAME = "rag_embedding_provider";
const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 2_000;
const MAX_TIMEOUT_MS = 120_000;
const SUPPORTED_DIMENSIONS = 1536;

export function createEmbeddingProviderConfigFromEnv(
  env: Record<string, string | undefined>,
): EmbeddingProviderConfigResult {
  const apiKey = env.RAG_EMBEDDING_PROVIDER_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: notConfigured(
        "服务端未配置 RAG_EMBEDDING_PROVIDER_API_KEY，pgvector 检索将回退到本地题库。",
      ),
    };
  }

  const protocol = env.RAG_EMBEDDING_PROVIDER_PROTOCOL?.trim() || "openai";
  if (protocol !== "openai") {
    return {
      ok: false,
      error: notConfigured("RAG_EMBEDDING_PROVIDER_PROTOCOL 当前仅支持 openai。"),
    };
  }

  const dimensionsText = env.RAG_EMBEDDING_DIMENSIONS?.trim() || "1536";
  const dimensions = Number(dimensionsText);
  if (dimensions !== SUPPORTED_DIMENSIONS) {
    return {
      ok: false,
      error: notConfigured("RAG_EMBEDDING_DIMENSIONS 当前必须是 1536。"),
    };
  }

  return {
    ok: true,
    value: {
      protocol: "openai",
      base_url: env.RAG_EMBEDDING_PROVIDER_BASE_URL?.trim() || DEFAULT_BASE_URL,
      model: env.RAG_EMBEDDING_PROVIDER_MODEL?.trim() || DEFAULT_MODEL,
      api_key: apiKey,
      provider_name:
        env.RAG_EMBEDDING_PROVIDER_NAME?.trim() || DEFAULT_PROVIDER_NAME,
      timeout_ms: parseTimeoutMs(env.RAG_EMBEDDING_PROVIDER_TIMEOUT_MS),
      dimensions: SUPPORTED_DIMENSIONS,
    },
  };
}

export function createEmbeddingProvider(
  config: EmbeddingProviderConfig,
): EmbeddingProvider {
  const fetchFn = config.fetch_fn ?? fetch;

  return {
    async embedText(input): Promise<EmbeddingProviderResult> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeout_ms);

      try {
        const response = await fetchFn(buildEmbeddingsUrl(config.base_url), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.api_key}`,
          },
          body: JSON.stringify({
            model: config.model,
            input: input.text,
            dimensions: config.dimensions,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          return {
            ok: false,
            error: {
              code: "model_request_failed",
              message: "RAG embedding provider 请求失败，已回退本地题库。",
              recoverable: true,
              failure_kind: "http_error",
              provider_name: config.provider_name,
              http_status: response.status,
            },
          };
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          return invalidOutput(
            config,
            "invalid_json",
            "RAG embedding provider 返回的 JSON 无法解析。",
          );
        }

        const embedding = readEmbedding(payload);
        if (
          !embedding ||
          embedding.length !== config.dimensions ||
          !embedding.every((value) => Number.isFinite(value))
        ) {
          return invalidOutput(
            config,
            "invalid_output",
            "RAG embedding provider 返回的向量维度不符合 1536。",
          );
        }

        return {
          ok: true,
          value: {
            embedding,
            model: config.model,
            provider_name: config.provider_name,
            dimensions: config.dimensions,
          },
        };
      } catch (error) {
        const isTimeout =
          error instanceof DOMException && error.name === "AbortError";

        return {
          ok: false,
          error: {
            code: isTimeout ? "model_timeout" : "model_request_failed",
            message: isTimeout
              ? "RAG embedding provider 请求超时，已回退本地题库。"
              : "RAG embedding provider 网络请求失败，已回退本地题库。",
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

function notConfigured(message: string): EmbeddingProviderError {
  return {
    code: "model_not_configured",
    message,
    recoverable: true,
    failure_kind: "not_configured",
  };
}

function invalidOutput(
  config: EmbeddingProviderConfig,
  failureKind: "invalid_json" | "invalid_output",
  message: string,
): EmbeddingProviderResult {
  return {
    ok: false,
    error: {
      code: "model_invalid_output",
      message,
      recoverable: true,
      failure_kind: failureKind,
      provider_name: config.provider_name,
    },
  };
}

function readEmbedding(payload: unknown): number[] | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const first = data[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) {
    return null;
  }

  const embedding = (first as { embedding?: unknown }).embedding;
  return Array.isArray(embedding) &&
    embedding.every((value) => typeof value === "number")
    ? embedding
    : null;
}

function buildEmbeddingsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/u, "");
  return trimmed.endsWith("/embeddings") ? trimmed : `${trimmed}/embeddings`;
}

function parseTimeoutMs(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(Math.max(parsed, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}
