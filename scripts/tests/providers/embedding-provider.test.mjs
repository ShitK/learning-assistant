import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const {
  createEmbeddingProvider,
  createEmbeddingProviderConfigFromEnv,
} = jiti("./src/lib/providers/embedding-provider.ts");

const missingConfig = createEmbeddingProviderConfigFromEnv({});
assert.equal(missingConfig.ok, false);
assert.equal(missingConfig.error.code, "model_not_configured");
assert.equal(missingConfig.error.message.includes("RAG_EMBEDDING_PROVIDER_API_KEY"), true);
assert.equal(missingConfig.error.message.includes("secret"), false);

const configResult = createEmbeddingProviderConfigFromEnv({
  RAG_EMBEDDING_PROVIDER_PROTOCOL: "openai",
  RAG_EMBEDDING_PROVIDER_BASE_URL: "https://api.openai.com/v1",
  RAG_EMBEDDING_PROVIDER_MODEL: "text-embedding-3-small",
  RAG_EMBEDDING_PROVIDER_API_KEY: "local-secret",
  RAG_EMBEDDING_PROVIDER_NAME: "rag_embedding_provider",
  RAG_EMBEDDING_PROVIDER_TIMEOUT_MS: "45000",
  RAG_EMBEDDING_DIMENSIONS: "1536",
});

assert.equal(configResult.ok, true);
assert.equal(configResult.value.protocol, "openai");
assert.equal(configResult.value.base_url, "https://api.openai.com/v1");
assert.equal(configResult.value.model, "text-embedding-3-small");
assert.equal(configResult.value.provider_name, "rag_embedding_provider");
assert.equal(configResult.value.timeout_ms, 45000);
assert.equal(configResult.value.dimensions, 1536);

const unsupportedProtocol = createEmbeddingProviderConfigFromEnv({
  RAG_EMBEDDING_PROVIDER_PROTOCOL: "anthropic",
  RAG_EMBEDDING_PROVIDER_API_KEY: "local-secret",
});
assert.equal(unsupportedProtocol.ok, false);
assert.equal(unsupportedProtocol.error.code, "model_not_configured");

const invalidDimensions = createEmbeddingProviderConfigFromEnv({
  RAG_EMBEDDING_PROVIDER_API_KEY: "local-secret",
  RAG_EMBEDDING_DIMENSIONS: "768",
});
assert.equal(invalidDimensions.ok, false);
assert.equal(invalidDimensions.error.code, "model_not_configured");

const requests = [];
const provider = createEmbeddingProvider({
  protocol: "openai",
  base_url: "https://api.openai.com/v1",
  model: "text-embedding-3-small",
  api_key: "local-secret",
  provider_name: "rag_embedding_provider",
  timeout_ms: 30000,
  dimensions: 1536,
  fetch_fn: async (url, init) => {
    requests.push({
      url,
      headers: init.headers,
      body: JSON.parse(init.body),
    });

    return new Response(
      JSON.stringify({
        model: "text-embedding-3-small",
        data: [{ embedding: Array.from({ length: 1536 }, (_, index) => index / 1536) }],
      }),
      { status: 200 },
    );
  },
});

const result = await provider.embedText({ text: "导数 单调性 变式练习" });
assert.equal(result.ok, true);
assert.equal(result.value.embedding.length, 1536);
assert.equal(result.value.model, "text-embedding-3-small");
assert.equal(result.value.dimensions, 1536);
assert.equal(result.value.provider_name, "rag_embedding_provider");
assert.equal(requests.length, 1);
assert.equal(requests[0].url, "https://api.openai.com/v1/embeddings");
assert.equal(requests[0].headers.Authorization, "Bearer local-secret");
assert.deepEqual(requests[0].body, {
  model: "text-embedding-3-small",
  input: "导数 单调性 变式练习",
  dimensions: 1536,
});

const badDimensionProvider = createEmbeddingProvider({
  protocol: "openai",
  base_url: "https://api.openai.com/v1",
  model: "text-embedding-3-small",
  api_key: "local-secret",
  provider_name: "rag_embedding_provider",
  timeout_ms: 30000,
  dimensions: 1536,
  fetch_fn: async () =>
    new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), {
      status: 200,
    }),
});

const badDimensionResult = await badDimensionProvider.embedText({ text: "x" });
assert.equal(badDimensionResult.ok, false);
assert.equal(badDimensionResult.error.code, "model_invalid_output");
assert.equal(JSON.stringify(badDimensionResult).includes("local-secret"), false);

const httpErrorProvider = createEmbeddingProvider({
  protocol: "openai",
  base_url: "https://api.openai.com/v1",
  model: "text-embedding-3-small",
  api_key: "local-secret",
  provider_name: "rag_embedding_provider",
  timeout_ms: 30000,
  dimensions: 1536,
  fetch_fn: async () => new Response("failed", { status: 500 }),
});

const httpErrorResult = await httpErrorProvider.embedText({ text: "x" });
assert.equal(httpErrorResult.ok, false);
assert.equal(httpErrorResult.error.failure_kind, "http_error");
assert.equal(httpErrorResult.error.http_status, 500);

const invalidJsonProvider = createEmbeddingProvider({
  protocol: "openai",
  base_url: "https://api.openai.com/v1",
  model: "text-embedding-3-small",
  api_key: "local-secret",
  provider_name: "rag_embedding_provider",
  timeout_ms: 30000,
  dimensions: 1536,
  fetch_fn: async () => new Response("{", { status: 200 }),
});

const invalidJsonResult = await invalidJsonProvider.embedText({ text: "x" });
assert.equal(invalidJsonResult.ok, false);
assert.equal(invalidJsonResult.error.failure_kind, "invalid_json");

console.log("embedding provider tests passed");
