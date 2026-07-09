import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();

const { demoStudentProfile, sampleDiagnoses } = jiti(
  "./src/data/mathtrace-demo.ts",
);
const { runMathTraceAgent } = jiti(
  "./src/lib/diagnosis/mathtrace-agent-pipeline.ts",
);
const { runImageMathTraceAgent } = jiti(
  "./src/lib/image-diagnosis/image-diagnosis-pipeline.ts",
);
const {
  runVisionExtractionAgent,
} = jiti("./src/lib/diagnosis/agents/vision-extraction-agent.ts");
const {
  runSampleMistakeDiagnosisAgent,
  runConfirmedImageMistakeDiagnosisAgent,
} = jiti("./src/lib/diagnosis/agents/mistake-diagnosis-agent.ts");
const {
  runLearningMemoryAgent,
} = jiti("./src/lib/diagnosis/agents/learning-memory-agent.ts");
const {
  persistDiagnosisIfNeeded: servicePersistDiagnosisIfNeeded,
  handleDiagnoseRequest,
} = jiti("./src/lib/diagnosis/diagnose-service.ts");
const { handleConfirmRequest } = jiti(
  "./src/lib/diagnosis/confirm-service.ts",
);
const { DATABASE_NOT_CONFIGURED_WARNING } = jiti(
  "./src/lib/shared/persistence-warnings.ts",
);

assert.equal(
  typeof servicePersistDiagnosisIfNeeded,
  "function",
  "diagnose-service should keep persistDiagnosisIfNeeded re-export compatibility.",
);

const firstSample = sampleDiagnoses[0];
assert.ok(firstSample, "sample fixture should exist");

const sampleRequest = {
  student_id: "demo_student_001",
  task_type: "sample_diagnosis",
  sample_question_id: firstSample.id,
  image_base64: null,
  student_profile: demoStudentProfile,
  mistake_history: [],
};

assert.deepEqual(
  runSampleMistakeDiagnosisAgent(sampleRequest),
  runMathTraceAgent(sampleRequest),
  "MistakeDiagnosisAgent sample role should preserve existing sample diagnosis output.",
);

const extraction = {
  question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
  student_answer: "只令 $f'(x)=0$ 得 $x=\\sqrt a$。",
  student_solution_steps: ["求导", "只写一个临界点"],
  extraction_confidence: "high",
  warnings: [],
};
const confirmedImageInput = {
  request: {
    student_id: "demo_student_001",
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  extraction,
  is_extraction_confirmed: true,
  confirmation_action: "diagnose_from_student_work",
};

assert.deepEqual(
  runConfirmedImageMistakeDiagnosisAgent(confirmedImageInput),
  runImageMathTraceAgent(confirmedImageInput),
  "MistakeDiagnosisAgent confirmed-image role should preserve existing image diagnosis output.",
);

const visionResult = await runVisionExtractionAgent({
  request: {
    student_id: "demo_student_001",
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: "data:image/png;base64,iVBORw0KGgo=",
    image_mime_type: "image/png",
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  vision_provider: {
    async extractQuestionFromImage() {
      return { ok: true, value: extraction };
    },
  },
});

assert.equal(visionResult.status, 200);
assert.equal(visionResult.body.stage, "extraction_review");
assert.equal(visionResult.body.requires_confirmation, true);
assert.equal("memory_delta" in visionResult.body, false);
assert.equal("student_profile" in visionResult.body, false);

const missingImageResult = await runVisionExtractionAgent({
  request: {
    student_id: "demo_student_001",
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: null,
    image_mime_type: "image/png",
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  vision_provider: {
    async extractQuestionFromImage() {
      throw new Error("provider should not be called for missing image");
    },
  },
});

assert.equal(missingImageResult.status, 400);
assert.equal(missingImageResult.body.error.code, "missing_image");

const providerTimeoutResult = await runVisionExtractionAgent({
  request: {
    student_id: "demo_student_001",
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: "data:image/png;base64,iVBORw0KGgo=",
    image_mime_type: "image/png",
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  vision_provider: {
    async extractQuestionFromImage() {
      return {
        ok: false,
        error: {
          code: "model_timeout",
          message: "模型请求超时。",
          recoverable: true,
        },
      };
    },
  },
});

assert.equal(providerTimeoutResult.status, 502);
assert.equal(providerTimeoutResult.body.error.code, "model_timeout");
assert.equal(providerTimeoutResult.body.fallback_used, true);

const warningsResult = await runLearningMemoryAgent({
  result: {
    status: 200,
    body: runMathTraceAgent(sampleRequest),
  },
  persistence_repository: {
    async persistDiagnosis() {
      return { status: "duplicate" };
    },
  },
});

assert.equal(warningsResult.status, 200);
assert.equal(
  warningsResult.body.warnings.includes("本题已加入错题本。"),
  true,
  "LearningMemoryAgent should preserve duplicate warning behavior.",
);

const visionSource = await readFile(
  "src/lib/diagnosis/agents/vision-extraction-agent.ts",
  "utf8",
);
assert.equal(
  /memory_delta|student_profiles|mistake_book_items/.test(visionSource),
  false,
  "VisionExtractionAgent must not know persistence or profile write fields.",
);

const mistakeSource = await readFile(
  "src/lib/diagnosis/agents/mistake-diagnosis-agent.ts",
  "utf8",
);
assert.equal(
  /persistDiagnosis|syncProjectedStudentProfile|Supabase|service_role/.test(
    mistakeSource,
  ),
  false,
  "MistakeDiagnosisAgent must not persist or access Supabase.",
);

const sampleServiceResult = await handleDiagnoseRequest(sampleRequest, {
  persistence_repository: {
    async persistDiagnosis() {
      return { status: "disabled" };
    },
  },
});

assert.equal(sampleServiceResult.status, 200);
assert.equal(sampleServiceResult.body.source, "sample");
assert.equal(
  sampleServiceResult.body.warnings.includes(DATABASE_NOT_CONFIGURED_WARNING),
  true,
);

const imageServiceResult = await handleDiagnoseRequest(
  {
    student_id: "demo_student_001",
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: "data:image/png;base64,iVBORw0KGgo=",
    image_mime_type: "image/png",
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  {
    vision_provider: {
      async extractQuestionFromImage() {
        return { ok: true, value: extraction };
      },
    },
  },
);

assert.equal(imageServiceResult.status, 200);
assert.equal(imageServiceResult.body.stage, "extraction_review");
assert.equal("memory_delta" in imageServiceResult.body, false);

const confirmServiceResult = await handleConfirmRequest(
  {
    student_id: "demo_student_001",
    task_type: "confirmed_image_diagnosis",
    confirmation_token: imageServiceResult.body.confirmation_token,
    confirmed_extraction: extraction,
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  {
    persistence_repository: {
      async persistDiagnosis() {
        return { status: "disabled" };
      },
    },
  },
);

assert.equal(confirmServiceResult.status, 200);
assert.equal(confirmServiceResult.body.source, "image");
assert.equal(confirmServiceResult.body.memory_delta.should_persist, true);
assert.equal(
  confirmServiceResult.body.warnings.includes(DATABASE_NOT_CONFIGURED_WARNING),
  true,
);
