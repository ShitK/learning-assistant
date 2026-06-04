import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const { handleDiagnoseRequest } = jiti("../src/lib/diagnose-service.ts");
const { handleConfirmRequest } = jiti("../src/lib/confirm-service.ts");
const { POST: confirmRoutePost } = jiti("../src/app/api/confirm/route.ts");
const { isDiagnoseImageExtractionResponse } = jiti(
  "../src/lib/diagnose-api.ts",
);
const { parseConfirmedExtractionDraft } = jiti(
  "../src/lib/image-confirmation.ts",
);
const {
  createImageConfirmationToken,
  verifyImageConfirmationToken,
} = jiti("../src/lib/image-confirmation-token.ts");
const { demoStudentProfile } = jiti("../src/data/mathtrace-demo.ts");

const provider = {
  async extractQuestionFromImage() {
    return {
      ok: true,
      value: {
        question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
        student_answer: "只令 $f'(x)=0$ 得 $x=\\sqrt a$。",
        student_solution_steps: ["求导", "只写一个临界点"],
        standard_solution_draft: "应讨论 $a\\le 0$ 与 $a>0$。",
        extraction_confidence: "high",
        warnings: [],
      },
    };
  },
};

const result = await handleDiagnoseRequest(
  {
    student_id: "demo_student_001",
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: "iVBORw0KGgo=",
    image_mime_type: "image/png",
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  { vision_provider: provider },
);

assert.equal(result.status, 200);
assert.equal(result.body.stage, "extraction_review");
assert.equal(result.body.requires_confirmation, true);
assert.equal(result.body.can_persist_after_confirmation, true);
assert.equal(result.body.sample_diagnosis, null);
assert.equal("memory_delta" in result.body, false);
assert.equal("student_profile" in result.body, false);
assert.equal(typeof result.body.confirmation_token, "string");
assert.equal(result.body.confirmation_token.length > 0, true);
assert.equal(isDiagnoseImageExtractionResponse(result.body), true);

const tokenPayload = JSON.parse(
  Buffer.from(resultTokenPart(result.body.confirmation_token), "base64url").toString(
    "utf8",
  ),
);

assert.equal(typeof tokenPayload.draft_fingerprint, "string");
assert.equal(tokenPayload.draft_fingerprint.length > 0, true);
assert.equal(
  JSON.stringify(tokenPayload).includes(
    "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
  ),
  false,
);
assert.equal(
  JSON.stringify(tokenPayload).includes("只令 $f'(x)=0$ 得 $x=\\sqrt a$。"),
  false,
);
assert.equal(
  JSON.stringify(tokenPayload).includes("应讨论 $a\\le 0$ 与 $a>0$。"),
  false,
);

const confirmResult = await handleConfirmRequest({
  student_id: "demo_student_001",
  task_type: "confirmed_image_diagnosis",
  confirmation_token: result.body.confirmation_token,
  confirmed_extraction: {
    question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
    student_answer: "只令 $f'(x)=0$ 得 $x=\\sqrt a$。",
    student_solution_steps: ["求导", "只写一个临界点"],
    standard_solution_draft: "应讨论 $a\\le 0$ 与 $a>0$。",
    extraction_confidence: "high",
    warnings: [],
  },
  student_profile: demoStudentProfile,
  mistake_history: [],
});

assert.equal(confirmResult.status, 200);
assert.equal(confirmResult.body.source, "image");
assert.equal(confirmResult.body.memory_delta.should_persist, true);

await assertConfirmRouteError(postConfirmRaw("{"), 400, "invalid_json");

const confirmRouteResponse = await postConfirmJson({
  student_id: "demo_student_001",
  task_type: "confirmed_image_diagnosis",
  confirmation_token: result.body.confirmation_token,
  confirmed_extraction: {
    question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
    student_answer: "只令 $f'(x)=0$ 得 $x=\\sqrt a$。",
    student_solution_steps: ["求导", "只写一个临界点"],
    standard_solution_draft: "应讨论 $a\\le 0$ 与 $a>0$。",
    extraction_confidence: "high",
    warnings: [],
  },
  student_profile: demoStudentProfile,
  mistake_history: [],
});
const confirmRouteBody = await confirmRouteResponse.json();

assert.equal(confirmRouteResponse.status, 200);
assert.equal(confirmRouteBody.source, "image");
assert.equal(confirmRouteBody.memory_delta.should_persist, true);

const mismatchedConfirmResult = await handleConfirmRequest({
  student_id: "demo_student_001",
  task_type: "confirmed_image_diagnosis",
  confirmation_token: result.body.confirmation_token,
  confirmed_extraction: {
    question_text: "这是被替换的另一道题。",
    student_answer: "只令 $f'(x)=0$ 得 $x=\\sqrt a$。",
    student_solution_steps: ["求导", "只写一个临界点"],
    standard_solution_draft: "应讨论 $a\\le 0$ 与 $a>0$。",
    extraction_confidence: "high",
    warnings: [],
  },
  student_profile: demoStudentProfile,
  mistake_history: [],
});

assert.equal(mismatchedConfirmResult.status, 200);
assert.equal(mismatchedConfirmResult.body.memory_delta.should_persist, false);
assert.equal(
  mismatchedConfirmResult.body.recognized_question.extraction_confidence,
  "low",
);
assert.equal(
  mismatchedConfirmResult.body.warnings.includes(
    "确认草稿与识别令牌不匹配，本次只生成报告，不写入长期画像。",
  ),
  true,
);

const missingTokenResult = await handleConfirmRequest({
  student_id: "demo_student_001",
  task_type: "confirmed_image_diagnosis",
  confirmed_extraction: {
    question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
    student_answer: "只令 $f'(x)=0$ 得 $x=\\sqrt a$。",
    student_solution_steps: ["求导", "只写一个临界点"],
    standard_solution_draft: "应讨论 $a\\le 0$ 与 $a>0$。",
    extraction_confidence: "high",
    warnings: [],
  },
  student_profile: demoStudentProfile,
  mistake_history: [],
});

assert.equal(missingTokenResult.status, 400);
assert.equal(missingTokenResult.body.error.code, "invalid_request");

const invalidTokenResult = await handleConfirmRequest({
  student_id: "demo_student_001",
  task_type: "confirmed_image_diagnosis",
  confirmation_token: "not-a-valid-token",
  confirmed_extraction: {
    question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
    student_answer: "只令 $f'(x)=0$ 得 $x=\\sqrt a$。",
    student_solution_steps: ["求导", "只写一个临界点"],
    standard_solution_draft: "应讨论 $a\\le 0$ 与 $a>0$。",
    extraction_confidence: "high",
    warnings: [],
  },
  student_profile: demoStudentProfile,
  mistake_history: [],
});

assert.equal(invalidTokenResult.status, 400);
assert.equal(invalidTokenResult.body.error.code, "invalid_request");

const lowConfidenceProvider = {
  async extractQuestionFromImage() {
    return {
      ok: true,
      value: {
        question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
        student_answer: "只令 $f'(x)=0$ 得 $x=\\sqrt a$。",
        student_solution_steps: ["求导", "只写一个临界点"],
        standard_solution_draft: "应讨论 $a\\le 0$ 与 $a>0$。",
        extraction_confidence: "low",
        warnings: ["识别置信度较低。"],
      },
    };
  },
};

const lowConfidenceReviewResult = await handleDiagnoseRequest(
  {
    student_id: "demo_student_001",
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: "iVBORw0KGgo=",
    image_mime_type: "image/png",
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  { vision_provider: lowConfidenceProvider },
);

assert.equal(lowConfidenceReviewResult.status, 200);
assert.equal(
  lowConfidenceReviewResult.body.can_persist_after_confirmation,
  false,
);
assert.equal(typeof lowConfidenceReviewResult.body.confirmation_token, "string");

const lowConfidenceConfirmResult = await handleConfirmRequest({
  student_id: "demo_student_001",
  task_type: "confirmed_image_diagnosis",
  confirmation_token: lowConfidenceReviewResult.body.confirmation_token,
  confirmed_extraction: {
    question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
    student_answer: "只令 $f'(x)=0$ 得 $x=\\sqrt a$。",
    student_solution_steps: ["求导", "只写一个临界点"],
    standard_solution_draft: "应讨论 $a\\le 0$ 与 $a>0$。",
    extraction_confidence: "high",
    warnings: ["识别置信度较低。"],
  },
  student_profile: demoStudentProfile,
  mistake_history: [],
});

assert.equal(lowConfidenceConfirmResult.status, 200);
assert.equal(lowConfidenceConfirmResult.body.source, "image");
assert.equal(
  lowConfidenceConfirmResult.body.memory_delta.should_persist,
  false,
);
assert.equal(
  lowConfidenceConfirmResult.body.recognized_question.extraction_confidence,
  "low",
);

const invalidConfirmResult = await handleConfirmRequest({
  student_id: "demo_student_001",
  task_type: "confirmed_image_diagnosis",
  confirmation_token: result.body.confirmation_token,
  confirmed_extraction: {
    question_text: "",
    student_answer: "学生答案",
    student_solution_steps: ["第一步"],
    standard_solution_draft: "标准解法",
    extraction_confidence: "high",
    warnings: [],
  },
  student_profile: demoStudentProfile,
  mistake_history: [],
});

assert.equal(invalidConfirmResult.status, 400);
assert.equal(invalidConfirmResult.body.error.code, "invalid_request");

const invalidStepsResult = parseConfirmedExtractionDraft({
  question_text: "题干",
  student_answer: "学生答案",
  student_solution_steps: [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    { text: "不允许对象数组" },
  ],
  standard_solution_draft: "标准解法",
  extraction_confidence: "high",
  warnings: [],
});

assert.equal(invalidStepsResult.ok, false);

const invalidWarningsResult = parseConfirmedExtractionDraft({
  question_text: "题干",
  student_answer: "学生答案",
  student_solution_steps: ["第一步"],
  standard_solution_draft: "标准解法",
  extraction_confidence: "high",
  warnings: ["1", "2", "3", "4", "5", { text: "不允许对象数组" }],
});

assert.equal(invalidWarningsResult.ok, false);

const longStepsResult = parseConfirmedExtractionDraft({
  question_text: "题干",
  student_answer: "学生答案",
  student_solution_steps: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
  standard_solution_draft: "标准解法",
  extraction_confidence: "high",
  warnings: [],
});

assert.equal(longStepsResult.ok, true);
assert.equal(longStepsResult.value.student_solution_steps.length, 8);

const longWarningsResult = parseConfirmedExtractionDraft({
  question_text: "题干",
  student_answer: "学生答案",
  student_solution_steps: ["第一步"],
  standard_solution_draft: "标准解法",
  extraction_confidence: "high",
  warnings: ["1", "2", "3", "4", "5", "6"],
});

assert.equal(longWarningsResult.ok, true);
assert.equal(longWarningsResult.value.warnings.length, 5);

const originalNodeEnv = process.env.NODE_ENV;
const originalConfirmSecret = process.env.MATHTRACE_CONFIRM_SECRET;
const originalMimoApiKey = process.env.MIMO_API_KEY;
try {
  process.env.NODE_ENV = "production";
  delete process.env.MATHTRACE_CONFIRM_SECRET;
  delete process.env.MIMO_API_KEY;

  assert.throws(() =>
    createImageConfirmationToken({
      draft_id: "image_draft_test",
      extraction_confidence: "high",
      can_persist_after_confirmation: true,
      draft_fingerprint: "signed-fingerprint",
    }),
  );
  assert.equal(
    verifyImageConfirmationToken(result.body.confirmation_token).ok,
    false,
  );

  process.env.MIMO_API_KEY = "mimo-key-must-not-sign-confirmation-token";

  assert.throws(() =>
    createImageConfirmationToken({
      draft_id: "image_draft_test",
      extraction_confidence: "high",
      can_persist_after_confirmation: true,
      draft_fingerprint: "signed-fingerprint",
    }),
  );
  assert.equal(
    verifyImageConfirmationToken(result.body.confirmation_token).ok,
    false,
  );
} finally {
  restoreEnvValue("NODE_ENV", originalNodeEnv);
  restoreEnvValue("MATHTRACE_CONFIRM_SECRET", originalConfirmSecret);
  restoreEnvValue("MIMO_API_KEY", originalMimoApiKey);
}

console.log("image confirmation test passed");

function resultTokenPart(token) {
  return token.split(".")[0] ?? "";
}

async function postConfirmJson(body) {
  return confirmRoutePost(
    new Request("http://localhost/api/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function postConfirmRaw(body) {
  return confirmRoutePost(
    new Request("http://localhost/api/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
  );
}

async function assertConfirmRouteError(
  responsePromise,
  expectedStatus,
  expectedCode,
) {
  const response = await responsePromise;
  const responseBody = await response.json();

  assert.equal(response.status, expectedStatus);
  assert.equal(responseBody.error.code, expectedCode);
  assert.equal(responseBody.error.recoverable, true);
}

function restoreEnvValue(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
