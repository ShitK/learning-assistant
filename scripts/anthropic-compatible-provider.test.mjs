import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const {
  createAnthropicCompatibleVisionProvider,
  createVisionProvider,
  createVisionProviderConfigFromEnv,
} = jiti("../src/lib/providers/anthropic-compatible-provider.ts");

const calls = [];
const okFetch = async (url, init) => {
  calls.push({ url: String(url), init });

  return new Response(
    JSON.stringify({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            question_text: "题干",
            student_answer: "学生答案",
            student_solution_steps: ["步骤一"],
            standard_solution_draft: "标准解法草稿",
            extraction_confidence: "medium",
            warnings: [],
          }),
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

const provider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "vision-model-test",
  api_key: "secret-key-for-test",
  timeout_ms: 1000,
  fetch_impl: okFetch,
});

const result = await provider.extractQuestionFromImage({
  image_base64: "iVBORw0KGgo=",
  mime_type: "image/png",
  student_profile_summary: "demo profile",
});

assert.equal(result.ok, true);
assert.equal(calls.length, 1);
assert.equal(calls[0].url, "https://example.test/anthropic/v1/messages");
assert.equal(calls[0].init.method, "POST");
assert.equal(calls[0].init.headers["x-api-key"], "secret-key-for-test");

const requestBody = JSON.parse(calls[0].init.body);
assert.equal(requestBody.model, "vision-model-test");
assert.equal(requestBody.temperature, 0);
assert.deepEqual(requestBody.thinking, { type: "disabled" });
assert.equal(requestBody.messages[0].content[0].type, "text");
assert.equal(requestBody.messages[0].content[1].type, "image");
assert.equal(
  requestBody.messages[0].content[1].source.media_type,
  "image/png",
);
assert.equal(requestBody.messages[0].content[1].source.data, "iVBORw0KGgo=");

const openAICalls = [];
const openAIProvider = createVisionProvider({
  protocol: "openai",
  base_url: "https://open.bigmodel.cn/api/paas/v4",
  model: "glm-4.6v-flashx",
  api_key: "secret-key-for-test",
  provider_name: "glm_4_6v_flashx",
  timeout_ms: 1000,
  fetch_impl: async (url, init) => {
    openAICalls.push({ url: String(url), init });

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                question_text: "题干",
                student_answer: "学生答案",
                student_solution_steps: ["步骤一"],
                standard_solution_draft: "标准解法草稿",
                extraction_confidence: "medium",
                warnings: [],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  },
});

const openAIResult = await openAIProvider.extractQuestionFromImage({
  image_base64: "iVBORw0KGgo=",
  mime_type: "image/png",
  student_profile_summary: "demo profile",
});

assert.equal(openAIResult.ok, true);
assert.equal(openAICalls.length, 1);
assert.equal(
  openAICalls[0].url,
  "https://open.bigmodel.cn/api/paas/v4/chat/completions",
);
assert.equal(openAICalls[0].init.method, "POST");
assert.equal(
  openAICalls[0].init.headers.Authorization,
  "Bearer secret-key-for-test",
);
assert.equal(openAICalls[0].init.headers["x-api-key"], undefined);

const openAIRequestBody = JSON.parse(openAICalls[0].init.body);
assert.equal(openAIRequestBody.model, "glm-4.6v-flashx");
assert.equal(openAIRequestBody.temperature, 0);
assert.equal(openAIRequestBody.thinking, undefined);
assert.deepEqual(openAIRequestBody.response_format, { type: "json_object" });
assert.equal(openAIRequestBody.messages[0].content[0].type, "image_url");
assert.equal(
  openAIRequestBody.messages[0].content[0].image_url.url,
  "data:image/png;base64,iVBORw0KGgo=",
);
assert.equal(openAIRequestBody.messages[0].content[1].type, "text");

const rawBase64ImageCalls = [];
const rawBase64ImageProvider = createVisionProvider({
  protocol: "openai",
  base_url: "https://open.bigmodel.cn/api/paas/v4",
  model: "glm-4.6v-flashx",
  api_key: "secret-key-for-test",
  provider_name: "glm_4_6v_flashx",
  image_format: "base64",
  timeout_ms: 1000,
  fetch_impl: async (url, init) => {
    rawBase64ImageCalls.push({ url: String(url), init });

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                question_text: "题干",
                student_answer: "学生答案",
                student_solution_steps: ["步骤一"],
                standard_solution_draft: "标准解法草稿",
                extraction_confidence: "medium",
                warnings: [],
              }),
            },
          },
        ],
      }),
      { status: 200 },
    );
  },
});

const rawBase64ImageResult =
  await rawBase64ImageProvider.extractQuestionFromImage({
    image_base64: "iVBORw0KGgo=",
    mime_type: "image/png",
    student_profile_summary: "demo profile",
  });
assert.equal(rawBase64ImageResult.ok, true);
const rawBase64ImageRequestBody = JSON.parse(rawBase64ImageCalls[0].init.body);
assert.equal(
  rawBase64ImageRequestBody.messages[0].content[0].image_url.url,
  "iVBORw0KGgo=",
);

const failedProvider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "vision-model-test",
  api_key: "secret-key-for-test",
  provider_name: "custom_vision_provider",
  timeout_ms: 1000,
  fetch_impl: async () =>
    new Response(JSON.stringify({ error: "bad" }), { status: 500 }),
});

const failedResult = await failedProvider.extractQuestionFromImage({
  image_base64: "iVBORw0KGgo=",
  mime_type: "image/png",
  student_profile_summary: "demo profile",
});
assert.equal(failedResult.ok, false);
assert.equal(failedResult.error.code, "model_request_failed");
assert.equal(failedResult.error.recoverable, true);
assert.equal(failedResult.error.message.includes("secret-key-for-test"), false);
assert.deepEqual(failedResult.error.provider_debug, {
  provider_name: "custom_vision_provider",
  provider_stage: "vision_llm",
  failure_kind: "http_error",
  http_status: 500,
});

const invalidJsonProvider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "vision-model-test",
  api_key: "secret-key-for-test",
  timeout_ms: 1000,
  fetch_impl: async () => new Response("not json", { status: 200 }),
});

const invalidJsonResult = await invalidJsonProvider.extractQuestionFromImage({
  image_base64: "iVBORw0KGgo=",
  mime_type: "image/png",
  student_profile_summary: "demo profile",
});
assert.equal(invalidJsonResult.ok, false);
assert.equal(invalidJsonResult.error.code, "model_request_failed");
assert.deepEqual(invalidJsonResult.error.provider_debug, {
  provider_name: "anthropic_compatible_vision",
  provider_stage: "vision_llm",
  failure_kind: "invalid_json",
});

const emptyTextProvider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "vision-model-test",
  api_key: "secret-key-for-test",
  timeout_ms: 1000,
  fetch_impl: async () =>
    new Response(JSON.stringify({ content: [] }), { status: 200 }),
});

const emptyTextResult = await emptyTextProvider.extractQuestionFromImage({
  image_base64: "iVBORw0KGgo=",
  mime_type: "image/png",
  student_profile_summary: "demo profile",
});
assert.equal(emptyTextResult.ok, false);
assert.equal(emptyTextResult.error.code, "model_invalid_output");
assert.deepEqual(emptyTextResult.error.provider_debug, {
  provider_name: "anthropic_compatible_vision",
  provider_stage: "vision_llm",
  failure_kind: "empty_text_content",
});

const networkFailedProvider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "vision-model-test",
  api_key: "secret-key-for-test",
  timeout_ms: 1000,
  fetch_impl: async () => {
    throw new TypeError("fetch failed");
  },
});

const networkFailedResult =
  await networkFailedProvider.extractQuestionFromImage({
    image_base64: "iVBORw0KGgo=",
    mime_type: "image/png",
    student_profile_summary: "demo profile",
  });
assert.equal(networkFailedResult.ok, false);
assert.equal(networkFailedResult.error.code, "model_request_failed");
assert.deepEqual(networkFailedResult.error.provider_debug, {
  provider_name: "anthropic_compatible_vision",
  provider_stage: "vision_llm",
  failure_kind: "network_failed",
});

const invalidOutputProvider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "vision-model-test",
  api_key: "secret-key-for-test",
  timeout_ms: 1000,
  fetch_impl: async () =>
    new Response(JSON.stringify({ content: [{ type: "text", text: "{}" }] }), {
      status: 200,
    }),
});

const invalidOutputResult =
  await invalidOutputProvider.extractQuestionFromImage({
    image_base64: "iVBORw0KGgo=",
    mime_type: "image/png",
    student_profile_summary: "demo profile",
  });
assert.equal(invalidOutputResult.ok, false);
assert.equal(invalidOutputResult.error.code, "model_invalid_output");

const retryCalls = [];
const retryProvider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "vision-model-test",
  api_key: "secret-key-for-test",
  timeout_ms: 1000,
  fetch_impl: async (url, init) => {
    retryCalls.push({ url: String(url), init });

    if (retryCalls.length === 1) {
      return new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                question_text: "题干",
                student_answer: "学生答案",
                student_solution_steps: ["步骤一"],
                extraction_confidence: "medium",
                warnings: [],
              }),
            },
          ],
        }),
        { status: 200 },
      );
    }

    return new Response(
      JSON.stringify({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              question_text: "题干",
              student_answer: "学生答案",
              student_solution_steps: ["步骤一"],
              standard_solution_draft: "补齐后的标准解法草稿",
              extraction_confidence: "medium",
              warnings: [],
            }),
          },
        ],
      }),
      { status: 200 },
    );
  },
});

const retryResult = await retryProvider.extractQuestionFromImage({
  image_base64: "iVBORw0KGgo=",
  mime_type: "image/png",
  student_profile_summary: "demo profile",
});
assert.equal(retryResult.ok, true);
assert.equal(
  retryResult.value.standard_solution_draft,
  "标准解法将在确认后由分析模型生成。",
);
assert.equal(retryCalls.length, 1);

const retryWithForbiddenTextValueCalls = [];
const retryWithForbiddenTextValueProvider =
  createAnthropicCompatibleVisionProvider({
    base_url: "https://example.test/anthropic",
    model: "vision-model-test",
    api_key: "secret-key-for-test",
    timeout_ms: 1000,
    fetch_impl: async () => {
      retryWithForbiddenTextValueCalls.push("called");

      if (retryWithForbiddenTextValueCalls.length === 1) {
        return new Response(
          JSON.stringify({
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  question_text: "题干",
                  student_answer: "本次不涉及 memory_delta: 保持现状",
                  student_solution_steps: ["步骤一"],
                  extraction_confidence: "medium",
                  warnings: [],
                }),
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                question_text: "题干",
                student_answer: "本次不涉及 memory_delta: 保持现状",
                student_solution_steps: ["步骤一"],
                standard_solution_draft: "补齐后的标准解法草稿",
                extraction_confidence: "medium",
                warnings: [],
              }),
            },
          ],
        }),
        { status: 200 },
      );
    },
  });

const retryWithForbiddenTextValueResult =
  await retryWithForbiddenTextValueProvider.extractQuestionFromImage({
    image_base64: "iVBORw0KGgo=",
    mime_type: "image/png",
    student_profile_summary: "demo profile",
  });
assert.equal(retryWithForbiddenTextValueResult.ok, true);
assert.equal(retryWithForbiddenTextValueCalls.length, 1);

const forbiddenRetryCalls = [];
const forbiddenRetryProvider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "vision-model-test",
  api_key: "secret-key-for-test",
  timeout_ms: 1000,
  fetch_impl: async () => {
    forbiddenRetryCalls.push("called");

    return new Response(
      JSON.stringify({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              question_text: "题干",
              student_answer: "学生答案",
              student_solution_steps: ["步骤一"],
              standard_solution_draft: "标准解法草稿",
              extraction_confidence: "medium",
              warnings: [],
              memory_delta: { should_persist: true },
            }),
          },
        ],
      }),
      { status: 200 },
    );
  },
});

const forbiddenRetryResult =
  await forbiddenRetryProvider.extractQuestionFromImage({
    image_base64: "iVBORw0KGgo=",
    mime_type: "image/png",
    student_profile_summary: "demo profile",
  });
assert.equal(forbiddenRetryResult.ok, false);
assert.equal(forbiddenRetryResult.error.code, "model_invalid_output");
assert.equal(forbiddenRetryCalls.length, 1);

const timeoutProvider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "vision-model-test",
  api_key: "secret-key-for-test",
  timeout_ms: 1,
  fetch_impl: (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason));
    }),
});

const timeoutResult = await timeoutProvider.extractQuestionFromImage({
  image_base64: "iVBORw0KGgo=",
  mime_type: "image/png",
  student_profile_summary: "demo profile",
});
assert.equal(timeoutResult.ok, false);
assert.equal(timeoutResult.error.code, "model_timeout");
assert.deepEqual(timeoutResult.error.provider_debug, {
  provider_name: "anthropic_compatible_vision",
  provider_stage: "vision_llm",
  failure_kind: "timeout",
});

const genericEnvConfig = createVisionProviderConfigFromEnv({
  VISION_PROVIDER_PROTOCOL: "openai",
  VISION_PROVIDER_BASE_URL: "https://open.bigmodel.cn/api/paas/v4",
  VISION_PROVIDER_MODEL: "glm-4.6v-flashx",
  VISION_PROVIDER_API_KEY: "vision-provider-key",
  VISION_PROVIDER_NAME: "glm_4_6v_flashx",
  VISION_PROVIDER_IMAGE_FORMAT: "base64",
  VISION_PROVIDER_TIMEOUT_MS: "60000",
  MIMO_BASE_URL: "https://legacy.example.test/anthropic",
  MIMO_MODEL: "legacy-model",
  MIMO_API_KEY: "legacy-key",
});
assert.equal(genericEnvConfig.ok, true);
assert.deepEqual(genericEnvConfig.value, {
  protocol: "openai",
  base_url: "https://open.bigmodel.cn/api/paas/v4",
  model: "glm-4.6v-flashx",
  api_key: "vision-provider-key",
  provider_name: "glm_4_6v_flashx",
  image_format: "base64",
  timeout_ms: 60_000,
});

const invalidTimeoutEnvConfig = createVisionProviderConfigFromEnv({
  VISION_PROVIDER_API_KEY: "vision-provider-key",
  VISION_PROVIDER_TIMEOUT_MS: "not-a-number",
});
assert.equal(invalidTimeoutEnvConfig.ok, true);
assert.equal(invalidTimeoutEnvConfig.value.timeout_ms, 15_000);

const legacyEnvConfig = createVisionProviderConfigFromEnv({
  MIMO_BASE_URL: "https://token-plan-cn.xiaomimimo.com/anthropic",
  MIMO_MODEL: "mimo-v2.5",
  MIMO_API_KEY: "legacy-key",
});
assert.equal(legacyEnvConfig.ok, true);
assert.deepEqual(legacyEnvConfig.value, {
  protocol: "anthropic",
  base_url: "https://token-plan-cn.xiaomimimo.com/anthropic",
  model: "mimo-v2.5",
  api_key: "legacy-key",
  provider_name: "anthropic_compatible_vision",
  image_format: "data_url",
  timeout_ms: 15_000,
});

const missingEnvConfig = createVisionProviderConfigFromEnv({
  MIMO_BASE_URL: "https://token-plan-cn.xiaomimimo.com/anthropic",
  MIMO_MODEL: "mimo-v2.5",
});
assert.equal(missingEnvConfig.ok, false);
assert.equal(missingEnvConfig.error.code, "model_not_configured");
assert.equal(missingEnvConfig.error.message.includes("VISION_PROVIDER_API_KEY"), true);
assert.equal(missingEnvConfig.error.message.includes("MIMO_API_KEY"), true);
assert.equal(missingEnvConfig.error.provider_debug, undefined);

console.log("anthropic compatible provider test passed");
