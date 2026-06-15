import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const { handleDiagnoseRequest } = jiti("../src/lib/diagnosis/diagnose-service.ts");
const { handleConfirmRequest } = jiti("../src/lib/diagnosis/confirm-service.ts");
const { POST: confirmRoutePost } = jiti("../src/app/api/confirm/route.ts");
const { isDiagnoseImageExtractionResponse } = jiti(
  "../src/lib/diagnosis/diagnose-api.ts",
);
const { parseConfirmedExtractionDraft } = jiti(
  "../src/lib/image-diagnosis/image-confirmation.ts",
);
const {
  createImageConfirmationFingerprint,
  createImageConfirmationToken,
  verifyImageConfirmationToken,
} = jiti("../src/lib/image-diagnosis/image-confirmation-token.ts");
const { demoStudentProfile } = jiti("../src/data/mathtrace-demo.ts");

const provider = {
  async extractQuestionFromImage() {
    return {
      ok: true,
      value: {
        question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
        student_answer: "只令 $f'(x)=0$ 得 $x=\\sqrt a$。",
        student_solution_steps: ["求导", "只写一个临界点"],
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
    extraction_confidence: "high",
    warnings: [],
  },
  student_profile: demoStudentProfile,
  mistake_history: [],
});

assert.equal(confirmResult.status, 200);
assert.equal(confirmResult.body.source, "image");
assert.equal(confirmResult.body.memory_delta.should_persist, true);

const enhancedConfirmResult = await handleConfirmRequest(
  {
    student_id: "demo_student_001",
    task_type: "confirmed_image_diagnosis",
    confirmation_token: result.body.confirmation_token,
    confirmed_extraction: {
      question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
      student_answer: "只令 $f'(x)=0$ 得 $x=\\sqrt a$。",
      student_solution_steps: ["求导", "只写一个临界点"],
      extraction_confidence: "high",
      warnings: [],
    },
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  {
    analysis_provider: {
      async analyzeConfirmedExtraction() {
        return {
          ok: true,
          value: {
            expected_diagnosis: "DeepSeek 增强：参数分类讨论缺失。",
            step_analysis: ["DeepSeek 增强步骤 1"],
            solution_highlights: ["DeepSeek 高亮 1"],
            standard_solution:
              "DeepSeek 标准解法：$f'(x)=0$ 后分类讨论。",
            warnings: ["分析模型结果已纳入报告。"],
          },
        };
      },
    },
  },
);

assert.equal(enhancedConfirmResult.status, 200);
assert.equal(
  enhancedConfirmResult.body.mistake_diagnosis.expected_diagnosis,
  "DeepSeek 增强：参数分类讨论缺失。",
);
assert.deepEqual(enhancedConfirmResult.body.mistake_diagnosis.step_analysis, [
  "DeepSeek 增强步骤 1",
]);
assert.equal(
  enhancedConfirmResult.body.mistake_diagnosis.standard_solution,
  "DeepSeek 标准解法：$f'(x)=0$ 后分类讨论。",
);
assert.equal(enhancedConfirmResult.body.memory_delta.should_persist, true);
assert.deepEqual(
  enhancedConfirmResult.body.memory_delta,
  confirmResult.body.memory_delta,
);
assert.equal(
  enhancedConfirmResult.body.warnings.includes("分析模型结果已纳入报告。"),
  true,
);

const failedAnalysisConfirmResult = await handleConfirmRequest(
  {
    student_id: "demo_student_001",
    task_type: "confirmed_image_diagnosis",
    confirmation_token: result.body.confirmation_token,
    confirmed_extraction: {
      question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
      student_answer: "只令 $f'(x)=0$ 得 $x=\\sqrt a$。",
      student_solution_steps: ["求导", "只写一个临界点"],
      extraction_confidence: "high",
      warnings: [],
    },
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  {
    analysis_provider: {
      async analyzeConfirmedExtraction() {
        return {
          ok: false,
          error: {
            code: "model_timeout",
            message: "timeout",
            recoverable: true,
            failure_kind: "timeout",
          },
        };
      },
    },
  },
);

assert.equal(failedAnalysisConfirmResult.status, 200);
assert.equal(
  failedAnalysisConfirmResult.body.mistake_diagnosis.expected_diagnosis,
  confirmResult.body.mistake_diagnosis.expected_diagnosis,
);
assert.equal(
  failedAnalysisConfirmResult.body.memory_delta.should_persist,
  true,
);

await assertConfirmRouteError(postConfirmRaw("{"), 400, "invalid_json");

const confirmRouteResponse = await postConfirmJson({
  student_id: "demo_student_001",
  task_type: "confirmed_image_diagnosis",
  confirmation_token: result.body.confirmation_token,
  confirmed_extraction: {
    question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
    student_answer: "只令 $f'(x)=0$ 得 $x=\\sqrt a$。",
    student_solution_steps: ["求导", "只写一个临界点"],
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

let mismatchAnalysisCallCount = 0;
const mismatchedAnalysisResult = await handleConfirmRequest(
  {
    student_id: "demo_student_001",
    task_type: "confirmed_image_diagnosis",
    confirmation_token: result.body.confirmation_token,
    confirmed_extraction: {
      question_text: "这是被替换的另一道题。",
      student_answer: "只令 $f'(x)=0$ 得 $x=\\sqrt a$。",
      student_solution_steps: ["求导", "只写一个临界点"],
      extraction_confidence: "high",
      warnings: [],
    },
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  {
    analysis_provider: {
      async analyzeConfirmedExtraction() {
        mismatchAnalysisCallCount += 1;
        return {
          ok: true,
          value: {
            expected_diagnosis: "不应使用",
            step_analysis: ["不应使用"],
            solution_highlights: ["不应使用"],
            standard_solution: "不应使用",
            warnings: [],
          },
        };
      },
    },
  },
);

assert.equal(mismatchAnalysisCallCount, 0);
assert.equal(
  mismatchedAnalysisResult.body.memory_delta.should_persist,
  false,
);

const missingTokenResult = await handleConfirmRequest({
  student_id: "demo_student_001",
  task_type: "confirmed_image_diagnosis",
  confirmed_extraction: {
    question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
    student_answer: "只令 $f'(x)=0$ 得 $x=\\sqrt a$。",
    student_solution_steps: ["求导", "只写一个临界点"],
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
    extraction_confidence: "high",
    warnings: [],
  },
  student_profile: demoStudentProfile,
  mistake_history: [],
});

assert.equal(invalidTokenResult.status, 400);
assert.equal(invalidTokenResult.body.error.code, "invalid_request");

const problemOnlyExtraction = {
  question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
  student_answer: "未识别到学生答案",
  student_solution_steps: [],
  extraction_confidence: "low",
  warnings: ["没有识别到学生作答区域。"],
};
const problemOnlyToken = createImageConfirmationToken({
  draft_id: "image_draft_problem_only",
  extraction_confidence: "low",
  can_persist_after_confirmation: false,
  draft_fingerprint: createImageConfirmationFingerprint(problemOnlyExtraction),
});

const skipFollowUpResult = await handleConfirmRequest({
  student_id: "demo_student_001",
  task_type: "confirmed_image_diagnosis",
  confirmation_token: problemOnlyToken,
  confirmation_action: "skip_follow_up",
  confirmed_extraction: problemOnlyExtraction,
  student_profile: demoStudentProfile,
  mistake_history: [],
});

assert.equal(skipFollowUpResult.status, 200);
assert.equal(skipFollowUpResult.body.evidence_level, "problem_only");
assert.equal(skipFollowUpResult.body.profile_update_kind, "problem_type_focus");
assert.equal(
  skipFollowUpResult.body.persistence_evidence,
  "uploaded_problem_only",
);
assert.deepEqual(skipFollowUpResult.body.memory_delta.mistake_cause_changes, {});
assert.deepEqual(skipFollowUpResult.body.memory_delta.knowledge_mastery_changes, {
  derivative_monotonicity: -2,
  parameter_classification: -2,
});
assert.equal(skipFollowUpResult.body.memory_delta.should_persist, true);
assert.equal(
  skipFollowUpResult.body.student_profile.frequent_mistake_causes
    .classification_missing,
  4,
);

let problemOnlyAnalysisCallCount = 0;
const analyzedSkipFollowUpResult = await handleConfirmRequest(
  {
    student_id: "demo_student_001",
    task_type: "confirmed_image_diagnosis",
    confirmation_token: problemOnlyToken,
    confirmation_action: "skip_follow_up",
    confirmed_extraction: problemOnlyExtraction,
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  {
    analysis_provider: {
      async analyzeConfirmedExtraction(extraction, context) {
        problemOnlyAnalysisCallCount += 1;
        assert.equal(extraction.question_text.trim().length > 0, true);
        assert.equal(Array.isArray(extraction.student_solution_steps), true);
        assert.equal(context.confirmation_action, "skip_follow_up");
        assert.equal(context.follow_up_answer, undefined);

        return {
          ok: true,
          value: {
            expected_diagnosis: "DeepSeek 展示增强：本题先求导再分类讨论。",
            step_analysis: ["DeepSeek 展示增强步骤"],
            solution_highlights: ["DeepSeek 展示增强高亮"],
            standard_solution:
              "DeepSeek 补全标准解法：先求导，再按 $a\\le 0$ 与 $a>0$ 分类讨论。",
            warnings: ["分析模型只增强展示文本。"],
          },
        };
      },
    },
  },
);

assert.equal(problemOnlyAnalysisCallCount, 1);
assert.equal(analyzedSkipFollowUpResult.status, 200);
assert.equal(
  analyzedSkipFollowUpResult.body.mistake_diagnosis.standard_solution,
  "DeepSeek 补全标准解法：先求导，再按 $a\\le 0$ 与 $a>0$ 分类讨论。",
);
assert.equal(
  analyzedSkipFollowUpResult.body.profile_update_kind,
  "problem_type_focus",
);
assert.deepEqual(
  analyzedSkipFollowUpResult.body.memory_delta.mistake_cause_changes,
  {},
);
assert.deepEqual(
  analyzedSkipFollowUpResult.body.memory_delta.knowledge_mastery_changes,
  skipFollowUpResult.body.memory_delta.knowledge_mastery_changes,
);

const extractionWithTechnicalWarning = {
  question_text: "已知函数 $f(x)=\\ln x-ax+1$。",
  student_answer: "未识别到学生答案",
  student_solution_steps: ["模型未识别到学生答案或具体解题步骤。"],
  extraction_confidence: "low",
  warnings: [
    "模型未返回置信度，已按低置信度处理。",
    "未识别到清晰学生作答区域，请确认图片中包含学生答案或解题痕迹。",
  ],
};
const tokenWithTechnicalWarning = createImageConfirmationToken({
  draft_id: "image_draft_warning_filter",
  extraction_confidence: "low",
  can_persist_after_confirmation: false,
  draft_fingerprint: createImageConfirmationFingerprint(
    extractionWithTechnicalWarning,
  ),
});
let warningFilteredAnalysisCallCount = 0;
const warningFilteredResult = await handleConfirmRequest(
  {
    student_id: "demo_student_001",
    task_type: "confirmed_image_diagnosis",
    confirmation_token: tokenWithTechnicalWarning,
    confirmation_action: "skip_follow_up",
    confirmed_extraction: {
      ...extractionWithTechnicalWarning,
      warnings: [
        "未识别到清晰学生作答区域，请确认图片中包含学生答案或解题痕迹。",
      ],
    },
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  {
    analysis_provider: {
      async analyzeConfirmedExtraction() {
        warningFilteredAnalysisCallCount += 1;

        return {
          ok: true,
          value: {
            expected_diagnosis: "DeepSeek 已基于确认题干生成分析。",
            step_analysis: ["DeepSeek 步骤"],
            solution_highlights: ["DeepSeek 高亮"],
            standard_solution: "DeepSeek 标准解法。",
            warnings: [],
          },
        };
      },
    },
  },
);
assert.equal(warningFilteredResult.status, 200);
assert.equal(warningFilteredAnalysisCallCount, 1);
assert.equal(
  warningFilteredResult.body.warnings.includes(
    "确认草稿与识别令牌不匹配，本次只生成报告，不写入长期画像。",
  ),
  false,
);

const mismatchedProblemOnlyToken = createImageConfirmationToken({
  draft_id: "image_draft_problem_only_mismatch",
  extraction_confidence: "low",
  can_persist_after_confirmation: false,
  draft_fingerprint: "different-problem-only-fingerprint",
});
const mismatchedSkipFollowUpResult = await handleConfirmRequest({
  student_id: "demo_student_001",
  task_type: "confirmed_image_diagnosis",
  confirmation_token: mismatchedProblemOnlyToken,
  confirmation_action: "skip_follow_up",
  confirmed_extraction: problemOnlyExtraction,
  student_profile: demoStudentProfile,
  mistake_history: [],
});

assert.equal(mismatchedSkipFollowUpResult.status, 200);
assert.equal(mismatchedSkipFollowUpResult.body.evidence_level, "problem_only");
assert.equal(
  mismatchedSkipFollowUpResult.body.profile_update_kind,
  "none",
);
assert.equal(mismatchedSkipFollowUpResult.body.persistence_evidence, "none");
assert.deepEqual(
  mismatchedSkipFollowUpResult.body.memory_delta.mistake_cause_changes,
  {},
);
assert.equal(
  mismatchedSkipFollowUpResult.body.memory_delta.should_persist,
  false,
);

const submittedFollowUpResult = await handleConfirmRequest({
  student_id: "demo_student_001",
  task_type: "confirmed_image_diagnosis",
  confirmation_token: problemOnlyToken,
  confirmation_action: "submit_stuck_point",
  follow_up_answer: {
    selected_stuck_point_id: "classification_missing",
    custom_text: null,
  },
  confirmed_extraction: problemOnlyExtraction,
  student_profile: demoStudentProfile,
  mistake_history: [],
});

assert.equal(submittedFollowUpResult.status, 200);
assert.equal(submittedFollowUpResult.body.evidence_level, "problem_only");
assert.equal(submittedFollowUpResult.body.persistence_evidence, "none");
assert.equal(submittedFollowUpResult.body.profile_update_kind, "none");
assert.deepEqual(submittedFollowUpResult.body.mistake_diagnosis.mistake_causes, [
  "classification_missing",
]);
assert.deepEqual(
  submittedFollowUpResult.body.memory_delta.mistake_cause_changes,
  {},
);
assert.equal(submittedFollowUpResult.body.memory_delta.should_persist, false);
assert.equal(
  submittedFollowUpResult.body.student_profile.frequent_mistake_causes
    .classification_missing,
  4,
);

let submittedAnalysisCallCount = 0;
const analyzedSubmittedFollowUpResult = await handleConfirmRequest(
  {
    student_id: "demo_student_001",
    task_type: "confirmed_image_diagnosis",
    confirmation_token: problemOnlyToken,
    confirmation_action: "submit_stuck_point",
    follow_up_answer: {
      selected_stuck_point_id: "classification_missing",
      custom_text: null,
    },
    confirmed_extraction: problemOnlyExtraction,
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  {
    analysis_provider: {
      async analyzeConfirmedExtraction(_extraction, context) {
        submittedAnalysisCallCount += 1;
        assert.equal(context.confirmation_action, "submit_stuck_point");
        assert.deepEqual(context.follow_up_answer, {
          selected_stuck_point_id: "classification_missing",
          custom_text: null,
        });

        return {
          ok: true,
          value: {
            expected_diagnosis: "DeepSeek 草稿：你可能卡在分类讨论。",
            step_analysis: ["DeepSeek 根据卡点生成草稿"],
            solution_highlights: ["DeepSeek 补充分类讨论结构"],
            standard_solution:
              "DeepSeek 草稿标准解法：求导后按参数分类讨论。",
            warnings: [],
          },
        };
      },
    },
  },
);

assert.equal(submittedAnalysisCallCount, 1);
assert.equal(analyzedSubmittedFollowUpResult.status, 200);
assert.equal(
  analyzedSubmittedFollowUpResult.body.mistake_diagnosis.expected_diagnosis,
  "DeepSeek 草稿：你可能卡在分类讨论。",
);
assert.equal(analyzedSubmittedFollowUpResult.body.profile_update_kind, "none");
assert.deepEqual(
  analyzedSubmittedFollowUpResult.body.memory_delta.mistake_cause_changes,
  {},
);
assert.equal(
  analyzedSubmittedFollowUpResult.body.memory_delta.should_persist,
  false,
);

const confirmedFollowUpResult = await handleConfirmRequest({
  student_id: "demo_student_001",
  task_type: "confirmed_image_diagnosis",
  confirmation_token: problemOnlyToken,
  confirmation_action: "confirm_stuck_point_analysis",
  follow_up_answer: {
    selected_stuck_point_id: "classification_missing",
    custom_text: null,
  },
  confirmed_extraction: problemOnlyExtraction,
  student_profile: demoStudentProfile,
  mistake_history: [],
});

assert.equal(confirmedFollowUpResult.status, 200);
assert.equal(confirmedFollowUpResult.body.persistence_evidence, "user_confirmed");
assert.equal(confirmedFollowUpResult.body.profile_update_kind, "mistake_cause");
assert.deepEqual(confirmedFollowUpResult.body.memory_delta.mistake_cause_changes, {
  classification_missing: 1,
});
assert.equal(confirmedFollowUpResult.body.memory_delta.should_persist, true);
assert.equal(
  confirmedFollowUpResult.body.student_profile.frequent_mistake_causes
    .classification_missing,
  5,
);

const lowConfidenceProvider = {
  async extractQuestionFromImage() {
    return {
      ok: true,
      value: {
        question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
        student_answer: "只令 $f'(x)=0$ 得 $x=\\sqrt a$。",
        student_solution_steps: ["求导", "只写一个临界点"],
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
    extraction_confidence: "high",
    warnings: [],
  },
  student_profile: demoStudentProfile,
  mistake_history: [],
});

assert.equal(invalidConfirmResult.status, 400);
assert.equal(invalidConfirmResult.body.error.code, "invalid_request");

const extraFieldResult = parseConfirmedExtractionDraft({
  question_text: "题干",
  student_answer: "学生答案",
  student_solution_steps: ["第一步"],
  extraction_confidence: "high",
  warnings: [],
  unexpected_field: "模型不应输出这个字段",
});

assert.equal(extraFieldResult.ok, false);
assert.equal(extraFieldResult.message, "confirmed_extraction 包含未声明字段。");

const extraProblemOnlyFieldResult = await handleConfirmRequest({
  student_id: "demo_student_001",
  task_type: "confirmed_image_diagnosis",
  confirmation_token: problemOnlyToken,
  confirmation_action: "skip_follow_up",
  confirmed_extraction: {
    ...problemOnlyExtraction,
    unexpected_field: "模型不应输出这个字段",
  },
  student_profile: demoStudentProfile,
  mistake_history: [],
});

assert.equal(extraProblemOnlyFieldResult.status, 400);
assert.equal(extraProblemOnlyFieldResult.body.error.code, "invalid_request");

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
  extraction_confidence: "high",
  warnings: [],
});

assert.equal(invalidStepsResult.ok, false);

const invalidWarningsResult = parseConfirmedExtractionDraft({
  question_text: "题干",
  student_answer: "学生答案",
  student_solution_steps: ["第一步"],
  extraction_confidence: "high",
  warnings: ["1", "2", "3", "4", "5", { text: "不允许对象数组" }],
});

assert.equal(invalidWarningsResult.ok, false);

const longStepsResult = parseConfirmedExtractionDraft({
  question_text: "题干",
  student_answer: "学生答案",
  student_solution_steps: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
  extraction_confidence: "high",
  warnings: [],
});

assert.equal(longStepsResult.ok, true);
assert.equal(longStepsResult.value.student_solution_steps.length, 8);

const longWarningsResult = parseConfirmedExtractionDraft({
  question_text: "题干",
  student_answer: "学生答案",
  student_solution_steps: ["第一步"],
  extraction_confidence: "high",
  warnings: ["1", "2", "3", "4", "5", "6"],
});

assert.equal(longWarningsResult.ok, true);
assert.equal(longWarningsResult.value.warnings.length, 5);

const originalNodeEnv = process.env.NODE_ENV;
const originalConfirmSecret = process.env.MATHTRACE_CONFIRM_SECRET;
const originalVisionProviderApiKey = process.env.VISION_PROVIDER_API_KEY;
const originalMimoApiKey = process.env.MIMO_API_KEY;
try {
  process.env.NODE_ENV = "development";
  delete process.env.MATHTRACE_CONFIRM_SECRET;
  process.env.VISION_PROVIDER_API_KEY = "vision-provider-confirm-secret";
  process.env.MIMO_API_KEY = "legacy-mimo-confirm-secret";

  const visionProviderSignedToken = createImageConfirmationToken({
    draft_id: "image_draft_test",
    extraction_confidence: "high",
    can_persist_after_confirmation: true,
    draft_fingerprint: "signed-fingerprint",
  });
  assert.equal(verifyImageConfirmationToken(visionProviderSignedToken).ok, true);

  process.env.VISION_PROVIDER_API_KEY = "wrong-vision-provider-secret";
  assert.equal(verifyImageConfirmationToken(visionProviderSignedToken).ok, true);

  delete process.env.VISION_PROVIDER_API_KEY;
  assert.equal(verifyImageConfirmationToken(visionProviderSignedToken).ok, true);

  process.env.NODE_ENV = "production";
  delete process.env.MATHTRACE_CONFIRM_SECRET;
  delete process.env.VISION_PROVIDER_API_KEY;
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

  process.env.VISION_PROVIDER_API_KEY =
    "vision-provider-key-must-not-sign-confirmation-token";
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
  restoreEnvValue("VISION_PROVIDER_API_KEY", originalVisionProviderApiKey);
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
