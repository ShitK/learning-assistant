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

const missingEnvConfig = createMimoProviderConfigFromEnv({
  MIMO_BASE_URL: "https://token-plan-cn.xiaomimimo.com/anthropic",
  MIMO_MODEL: "mimo-v2.5",
});
assert.equal(missingEnvConfig.ok, false);
assert.equal(missingEnvConfig.error.code, "model_not_configured");

console.log("anthropic compatible provider test passed");
