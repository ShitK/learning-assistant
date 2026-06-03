import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const {
  createAnthropicCompatibleVisionProvider,
  createMimoProviderConfigFromEnv,
} = jiti("../src/lib/anthropic-compatible-provider.ts");

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
  model: "mimo-v2.5",
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
assert.equal(requestBody.model, "mimo-v2.5");
assert.equal(requestBody.temperature, 0);
assert.deepEqual(requestBody.thinking, { type: "disabled" });
assert.equal(requestBody.messages[0].content[0].type, "text");
assert.equal(requestBody.messages[0].content[1].type, "image");
assert.equal(
  requestBody.messages[0].content[1].source.media_type,
  "image/png",
);
assert.equal(requestBody.messages[0].content[1].source.data, "iVBORw0KGgo=");

const failedProvider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "mimo-v2.5",
  api_key: "secret-key-for-test",
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
  provider_name: "mimo",
  provider_stage: "vision_llm",
  failure_kind: "http_error",
  http_status: 500,
});

const invalidJsonProvider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "mimo-v2.5",
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
  provider_name: "mimo",
  provider_stage: "vision_llm",
  failure_kind: "invalid_json",
});

const networkFailedProvider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "mimo-v2.5",
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
  provider_name: "mimo",
  provider_stage: "vision_llm",
  failure_kind: "network_failed",
});

const invalidOutputProvider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "mimo-v2.5",
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
  model: "mimo-v2.5",
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
assert.equal(retryResult.value.standard_solution_draft, "补齐后的标准解法草稿");
assert.equal(retryCalls.length, 2);
const retryRequestBody = JSON.parse(retryCalls[1].init.body);
assert.equal(
  retryRequestBody.messages[0].content[0].text.includes("上一次模型输出未通过校验"),
  true,
);
assert.equal(
  retryRequestBody.messages[0].content[0].text.includes("secret-key-for-test"),
  false,
);

const forbiddenRetryCalls = [];
const forbiddenRetryProvider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "mimo-v2.5",
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

const malformedForbiddenRetryCalls = [];
const malformedForbiddenRetryProvider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "mimo-v2.5",
  api_key: "secret-key-for-test",
  timeout_ms: 1000,
  fetch_impl: async () => {
    malformedForbiddenRetryCalls.push("called");

    return new Response(
      JSON.stringify({
        content: [
          {
            type: "text",
            text: '{"question_text":"题干","memory_delta":{"should_persist":true}',
          },
        ],
      }),
      { status: 200 },
    );
  },
});

const malformedForbiddenRetryResult =
  await malformedForbiddenRetryProvider.extractQuestionFromImage({
    image_base64: "iVBORw0KGgo=",
    mime_type: "image/png",
    student_profile_summary: "demo profile",
  });
assert.equal(malformedForbiddenRetryResult.ok, false);
assert.equal(malformedForbiddenRetryResult.error.code, "model_invalid_output");
assert.equal(malformedForbiddenRetryCalls.length, 1);

const singleQuotedForbiddenRetryCalls = [];
const singleQuotedForbiddenRetryProvider =
  createAnthropicCompatibleVisionProvider({
    base_url: "https://example.test/anthropic",
    model: "mimo-v2.5",
    api_key: "secret-key-for-test",
    timeout_ms: 1000,
    fetch_impl: async () => {
      singleQuotedForbiddenRetryCalls.push("called");

      return new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: "{'question_text':'题干','memory_delta':{'should_persist':true}",
            },
          ],
        }),
        { status: 200 },
      );
    },
  });

const singleQuotedForbiddenRetryResult =
  await singleQuotedForbiddenRetryProvider.extractQuestionFromImage({
    image_base64: "iVBORw0KGgo=",
    mime_type: "image/png",
    student_profile_summary: "demo profile",
  });
assert.equal(singleQuotedForbiddenRetryResult.ok, false);
assert.equal(singleQuotedForbiddenRetryResult.error.code, "model_invalid_output");
assert.equal(singleQuotedForbiddenRetryCalls.length, 1);

const timeoutProvider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "mimo-v2.5",
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
  provider_name: "mimo",
  provider_stage: "vision_llm",
  failure_kind: "timeout",
});

const missingEnvConfig = createMimoProviderConfigFromEnv({
  MIMO_BASE_URL: "https://token-plan-cn.xiaomimimo.com/anthropic",
  MIMO_MODEL: "mimo-v2.5",
});
assert.equal(missingEnvConfig.ok, false);
assert.equal(missingEnvConfig.error.code, "model_not_configured");
assert.equal(missingEnvConfig.error.provider_debug, undefined);

console.log("anthropic compatible provider test passed");
