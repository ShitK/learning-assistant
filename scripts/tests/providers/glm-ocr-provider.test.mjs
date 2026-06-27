import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const { createGlmOcrVisionProvider } = jiti("./src/lib/providers/glm-ocr-provider.ts");

const baseConfig = {
  protocol: "glm_ocr",
  base_url: "https://open.bigmodel.cn/api/paas/v4",
  model: "glm-ocr",
  api_key: "secret-key-for-test",
  provider_name: "glm_ocr",
  image_format: "base64",
  timeout_ms: 1000,
};

{
  const calls = [];
  const provider = createGlmOcrVisionProvider({
    ...baseConfig,
    fetch_impl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          id: "task_123456789",
          model: "GLM-OCR",
          md_results:
            "15. 已知函数 $f(x)=x^2$，求单调性。\n\n解：\n$f'(x)=2x$",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });

  const result = await provider.extractQuestionFromImage({
    image_base64: "iVBORw0KGgo=",
    mime_type: "image/png",
    student_profile_summary: "demo profile must not be sent",
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://open.bigmodel.cn/api/paas/v4/layout_parsing");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret-key-for-test");
  assert.equal(calls[0].init.headers["content-type"], "application/json");

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "glm-ocr");
  assert.equal(body.file, "data:image/png;base64,iVBORw0KGgo=");
  assert.equal(body.need_layout_visualization, false);
  assert.equal(body.return_crop_images, false);
  assert.equal("messages" in body, false);
  assert.equal(JSON.stringify(body).includes("demo profile"), false);
  assert.equal(JSON.stringify(body).includes("student_profile_summary"), false);
  assert.equal(result.value.question_text.includes("已知函数"), true);
  assert.equal(result.value.student_answer.includes("2x"), true);
}

{
  const calls = [];
  const provider = createGlmOcrVisionProvider({
    ...baseConfig,
    image_format: "data_url",
    fetch_impl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          md_results:
            "15. 已知函数 $f(x)=x^2$，求单调性。\n\n解：\n$f'(x)=2x$",
        }),
        { status: 200 },
      );
    },
  });

  const result = await provider.extractQuestionFromImage({
    image_base64: "iVBORw0KGgo=",
    mime_type: "image/png",
    student_profile_summary: "demo profile",
  });

  assert.equal(result.ok, true);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.file, "data:image/png;base64,iVBORw0KGgo=");
}

{
  const provider = createGlmOcrVisionProvider({
    ...baseConfig,
    fetch_impl: async () =>
      new Response(JSON.stringify({ error: { code: "bad_file", message: "bad file" } }), {
        status: 400,
      }),
  });

  const result = await provider.extractQuestionFromImage({
    image_base64: "iVBORw0KGgo=",
    mime_type: "image/png",
    student_profile_summary: "demo profile",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "model_request_failed");
  assert.deepEqual(result.error.provider_debug, {
    provider_name: "glm_ocr",
    provider_stage: "ocr",
    failure_kind: "http_error",
    http_status: 400,
  });
  assert.equal(result.error.message.includes("secret-key-for-test"), false);
}

{
  const provider = createGlmOcrVisionProvider({
    ...baseConfig,
    fetch_impl: async () => new Response("not-json", { status: 200 }),
  });

  const result = await provider.extractQuestionFromImage({
    image_base64: "iVBORw0KGgo=",
    mime_type: "image/png",
    student_profile_summary: "demo profile",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "model_request_failed");
  assert.equal(result.error.provider_debug.failure_kind, "invalid_json");
  assert.equal(result.error.provider_debug.provider_stage, "ocr");
}

{
  let callCount = 0;
  const provider = createGlmOcrVisionProvider({
    ...baseConfig,
    fetch_impl: async () => {
      callCount += 1;
      return new Response(JSON.stringify({ md_results: "" }), { status: 200 });
    },
  });

  const result = await provider.extractQuestionFromImage({
    image_base64: "iVBORw0KGgo=",
    mime_type: "image/png",
    student_profile_summary: "demo profile",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "model_invalid_output");
  assert.equal(result.error.provider_debug.failure_kind, "empty_text_content");
  assert.equal(result.error.provider_debug.provider_stage, "ocr");
  assert.equal(callCount, 1);
}

{
  const provider = createGlmOcrVisionProvider({
    ...baseConfig,
    fetch_impl: async () => {
      throw new Error("network down");
    },
  });

  const result = await provider.extractQuestionFromImage({
    image_base64: "iVBORw0KGgo=",
    mime_type: "image/png",
    student_profile_summary: "demo profile",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "model_request_failed");
  assert.equal(result.error.provider_debug.failure_kind, "network_failed");
}

{
  const provider = createGlmOcrVisionProvider({
    ...baseConfig,
    timeout_ms: 1,
    fetch_impl: (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () =>
          reject(init.signal.reason),
        );
      }),
  });

  const result = await provider.extractQuestionFromImage({
    image_base64: "iVBORw0KGgo=",
    mime_type: "image/png",
    student_profile_summary: "demo profile",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "model_timeout");
  assert.deepEqual(result.error.provider_debug, {
    provider_name: "glm_ocr",
    provider_stage: "ocr",
    failure_kind: "timeout",
  });
}

{
  const largeBase64 = Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64");
  let called = false;
  const provider = createGlmOcrVisionProvider({
    ...baseConfig,
    fetch_impl: async () => {
      called = true;
      return new Response(JSON.stringify({ md_results: "should not call" }), { status: 200 });
    },
  });

  const result = await provider.extractQuestionFromImage({
    image_base64: largeBase64,
    mime_type: "image/png",
    student_profile_summary: "demo profile",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "model_request_failed");
  assert.equal(result.error.message.includes("10MB"), true);
  assert.equal(called, false);
}
