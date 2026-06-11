import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const { handleDiagnoseRequest } = jiti("../src/lib/diagnose-service.ts");
const { handleConfirmRequest } = jiti("../src/lib/confirm-service.ts");
const {
  createDiagnosisPersistencePayload,
  createSupabaseDiagnosisPersistenceRepository,
  persistDiagnosisResponse,
} = jiti("../src/lib/diagnosis-persistence.ts");
const { runImageMathTraceAgent } = jiti(
  "../src/lib/image-diagnosis-pipeline.ts",
);
const {
  createImageConfirmationFingerprint,
  createImageConfirmationToken,
} = jiti("../src/lib/image-confirmation-token.ts");
const { demoStudentProfile, mistakeHistory } = jiti(
  "../src/data/mathtrace-demo.ts",
);

const samplePayload = {
  student_id: "demo_student_001",
  task_type: "sample_diagnosis",
  sample_question_id: "sample_derivative_001",
  image_base64: "data:image/png;base64," + "a".repeat(1400),
  student_profile: demoStudentProfile,
  mistake_history: mistakeHistory,
};

const sampleRepository = createRecordingRepository();
const sampleResult = await handleDiagnoseRequest(samplePayload, {
  persistence_repository: sampleRepository,
});

assert.equal(sampleResult.status, 200);
assert.equal(sampleRepository.calls.length, 1);
assert.equal(sampleRepository.calls[0].p_source, "sample");
assert.equal(sampleRepository.calls[0].p_evidence_level, null);
assert.equal(sampleRepository.calls[0].p_persistence_evidence, "student_work");
assert.equal(sampleRepository.calls[0].p_profile_update_kind, "mistake_cause");
assert.equal(
  sampleRepository.calls[0].p_question_text,
  sampleResult.body.recognized_question.question_text,
);
assert.equal(
  sampleRepository.calls[0].p_standard_solution,
  sampleResult.body.mistake_diagnosis.standard_solution,
);
assert.deepEqual(
  sampleRepository.calls[0].p_knowledge_points,
  sampleResult.body.knowledge_mapping.knowledge_points,
);
assert.deepEqual(
  sampleRepository.calls[0].p_mistake_causes,
  sampleResult.body.mistake_diagnosis.mistake_causes,
);
assert.deepEqual(
  sampleRepository.calls[0].p_student_profile_snapshot,
  sampleResult.body.student_profile,
);

const samplePayloadJson = JSON.stringify(sampleRepository.calls[0]);
assert.equal(samplePayloadJson.includes("image_base64"), false);
assert.equal(samplePayloadJson.includes("a".repeat(1200)), false);

const directPayload = createDiagnosisPersistencePayload(sampleResult.body);
assert.deepEqual(directPayload, sampleRepository.calls[0]);

const successfulRpcClient = createRecordingRpcClient({ error: null });
const successfulRpcRepository =
  createSupabaseDiagnosisPersistenceRepository(successfulRpcClient);
const successfulRpcResult =
  await successfulRpcRepository.persistDiagnosis(directPayload);

assert.deepEqual(successfulRpcResult, { status: "persisted" });
assert.equal(successfulRpcClient.calls.length, 1);
assert.equal(
  successfulRpcClient.calls[0].name,
  "persist_mathtrace_diagnosis",
);
assert.deepEqual(successfulRpcClient.calls[0].params, directPayload);

const failingRpcClient = createRecordingRpcClient({
  error: { message: "secret service role key should not leak" },
});
const failingRpcRepository =
  createSupabaseDiagnosisPersistenceRepository(failingRpcClient);
const failedRpcResult = await failingRpcRepository.persistDiagnosis(directPayload);

assert.deepEqual(failedRpcResult, { status: "failed" });

const migrationSql = readFileSync(
  new URL("../supabase/migrations/20260611000000_p17_mistake_book.sql", import.meta.url),
  "utf8",
);

assert.equal(
  migrationSql.includes(
    "create or replace function public.persist_mathtrace_diagnosis",
  ),
  true,
);
assert.equal(
  migrationSql.includes(
    "on conflict (student_id, client_diagnosis_id) do nothing",
  ),
  true,
);
assert.equal(
  migrationSql.includes(
    "Existing diagnosis run is missing mistake book item or memory event",
  ),
  true,
);
assert.equal(
  migrationSql.includes("Only demo_student_001 is supported in P1.7"),
  true,
);
assert.equal(
  migrationSql.includes("memory_delta.should_persist must be true"),
  true,
);
assert.equal(
  migrationSql.includes("profile_update_kind must be persistable"),
  true,
);
assert.equal(
  migrationSql.includes("Invalid sample diagnosis persistence policy"),
  true,
);
assert.equal(
  migrationSql.includes("Invalid image diagnosis persistence policy"),
  true,
);
assert.equal(
  migrationSql.includes(
    "grant select, insert, update on table public.students to service_role",
  ),
  true,
);
assert.equal(
  migrationSql.includes(
    "grant select, insert on table public.diagnosis_runs to service_role",
  ),
  true,
);
assert.equal(
  migrationSql.includes(
    "grant select, insert on table public.mistake_book_items to service_role",
  ),
  true,
);
assert.equal(
  migrationSql.includes(
    "grant select, insert on table public.memory_events to service_role",
  ),
  true,
);

const failedRpcServiceResult = await handleDiagnoseRequest(samplePayload, {
  persistence_repository: failingRpcRepository,
});

assert.equal(failedRpcServiceResult.status, 200);
assert.equal(failingRpcClient.calls.length, 2);
assert.equal(
  failedRpcServiceResult.body.warnings.includes(
    "错题本写入失败，本次诊断报告已保留。",
  ),
  true,
);
assert.equal(
  JSON.stringify(failedRpcServiceResult.body.warnings).includes("secret"),
  false,
);

const studentWorkExtraction = {
  question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
  student_answer: "只令 $f'(x)=0$ 得 $x=\\sqrt a$。",
  student_solution_steps: ["求导", "只写一个临界点"],
  standard_solution_draft: "应讨论 $a\\le 0$ 与 $a>0$。",
  extraction_confidence: "high",
  warnings: [],
};
const studentWorkRepository = createRecordingRepository();
const studentWorkResult = await handleConfirmRequest(
  createConfirmPayload(studentWorkExtraction),
  { persistence_repository: studentWorkRepository },
);

assert.equal(studentWorkResult.status, 200);
assert.equal(studentWorkRepository.calls.length, 1);
assert.equal(studentWorkRepository.calls[0].p_source, "image");
assert.equal(
  studentWorkRepository.calls[0].p_evidence_level,
  "student_work_sufficient",
);
assert.equal(
  studentWorkRepository.calls[0].p_persistence_evidence,
  "student_work",
);
assert.equal(studentWorkRepository.calls[0].p_profile_update_kind, "mistake_cause");

const problemOnlyExtraction = {
  question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
  student_answer: "未识别到学生答案",
  student_solution_steps: [],
  standard_solution_draft: "应先求导，再按参数分类讨论。",
  extraction_confidence: "low",
  warnings: ["没有识别到学生作答区域。"],
};
const skipRepository = createRecordingRepository();
const skipResult = await handleConfirmRequest(
  createConfirmPayload(problemOnlyExtraction, {
    confirmation_action: "skip_follow_up",
  }),
  { persistence_repository: skipRepository },
);

assert.equal(skipResult.status, 200);
assert.equal(skipRepository.calls.length, 1);
assert.equal(skipRepository.calls[0].p_profile_update_kind, "problem_type_focus");
assert.equal(
  skipRepository.calls[0].p_persistence_evidence,
  "uploaded_problem_only",
);
assert.deepEqual(skipRepository.calls[0].p_memory_delta.mistake_cause_changes, {});
assert.deepEqual(skipRepository.calls[0].p_mistake_causes, []);

const confirmedStuckPointRepository = createRecordingRepository();
const confirmedStuckPointResult = await handleConfirmRequest(
  createConfirmPayload(problemOnlyExtraction, {
    confirmation_action: "confirm_stuck_point_analysis",
    follow_up_answer: {
      selected_stuck_point_id: "classification_missing",
      custom_text: null,
    },
  }),
  { persistence_repository: confirmedStuckPointRepository },
);

assert.equal(confirmedStuckPointResult.status, 200);
assert.equal(confirmedStuckPointRepository.calls.length, 1);
assert.equal(
  confirmedStuckPointRepository.calls[0].p_persistence_evidence,
  "user_confirmed",
);
assert.equal(
  confirmedStuckPointRepository.calls[0].p_profile_update_kind,
  "mistake_cause",
);

const submitRepository = createRecordingRepository();
const submitResult = await handleConfirmRequest(
  createConfirmPayload(problemOnlyExtraction, {
    confirmation_action: "submit_stuck_point",
    follow_up_answer: {
      selected_stuck_point_id: "classification_missing",
      custom_text: null,
    },
  }),
  { persistence_repository: submitRepository },
);

assert.equal(submitResult.status, 200);
assert.equal(submitResult.body.memory_delta.should_persist, false);
assert.equal(submitRepository.calls.length, 0);

const insufficientResponse = runImageMathTraceAgent({
  request: {
    student_id: "demo_student_001",
    student_profile: demoStudentProfile,
    mistake_history: mistakeHistory,
  },
  extraction: {
    question_text: "",
    student_answer: "只令 $f'(x)=0$。",
    student_solution_steps: ["求导"],
    standard_solution_draft: "",
    extraction_confidence: "high",
    warnings: ["题干和标准解法不足。"],
  },
  is_extraction_confirmed: true,
});
const insufficientRepository = createRecordingRepository();
const insufficientPersistenceResult = await persistDiagnosisResponse(
  insufficientResponse,
  insufficientRepository,
);

assert.equal(insufficientResponse.evidence_level, "insufficient");
assert.deepEqual(insufficientPersistenceResult, { status: "skipped" });
assert.equal(insufficientRepository.calls.length, 0);

const tokenMismatchRepository = createRecordingRepository();
const tokenMismatchResult = await handleConfirmRequest(
  createConfirmPayload(studentWorkExtraction, {
    confirmed_extraction: {
      ...studentWorkExtraction,
      question_text: "这是被替换的另一道题。",
    },
  }),
  { persistence_repository: tokenMismatchRepository },
);

assert.equal(tokenMismatchResult.status, 200);
assert.equal(tokenMismatchResult.body.memory_delta.should_persist, false);
assert.equal(tokenMismatchRepository.calls.length, 0);

const noneProfileUpdateRepository = createRecordingRepository();
const noneProfileUpdateResult = await persistDiagnosisResponse(
  {
    ...studentWorkResult.body,
    profile_update_kind: "none",
    memory_delta: {
      ...studentWorkResult.body.memory_delta,
      should_persist: true,
    },
  },
  noneProfileUpdateRepository,
);

assert.deepEqual(noneProfileUpdateResult, { status: "skipped" });
assert.equal(noneProfileUpdateRepository.calls.length, 0);

const nonePersistenceEvidenceRepository = createRecordingRepository();
const nonePersistenceEvidenceResult = await persistDiagnosisResponse(
  {
    ...studentWorkResult.body,
    persistence_evidence: "none",
    memory_delta: {
      ...studentWorkResult.body.memory_delta,
      should_persist: true,
    },
  },
  nonePersistenceEvidenceRepository,
);

assert.deepEqual(nonePersistenceEvidenceResult, { status: "skipped" });
assert.equal(nonePersistenceEvidenceRepository.calls.length, 0);

const failingRepository = createRecordingRepository({ shouldThrow: true });
const failingResult = await handleDiagnoseRequest(samplePayload, {
  persistence_repository: failingRepository,
});

assert.equal(failingResult.status, 200);
assert.equal(failingRepository.calls.length, 1);
assert.equal(
  failingResult.body.warnings.includes(
    "错题本写入失败，本次诊断报告已保留。",
  ),
  true,
);
assert.equal(JSON.stringify(failingResult.body.warnings).includes("secret"), false);

const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
try {
  const unconfiguredSample = await handleDiagnoseRequest(samplePayload);
  assert.equal(unconfiguredSample.status, 200);
  assert.equal(
    unconfiguredSample.body.warnings.includes(
      "数据库暂未配置，本次只返回诊断报告。",
    ),
    true,
  );

  const unconfiguredConfirm = await handleConfirmRequest(
    createConfirmPayload(studentWorkExtraction),
  );
  assert.equal(unconfiguredConfirm.status, 200);
  assert.equal(
    unconfiguredConfirm.body.warnings.includes(
      "数据库暂未配置，本次只返回诊断报告。",
    ),
    true,
  );
} finally {
  restoreEnv("SUPABASE_URL", originalSupabaseUrl);
  restoreEnv("SUPABASE_SERVICE_ROLE_KEY", originalSupabaseServiceRoleKey);
}

process.env.SUPABASE_URL = "not-a-url";
process.env.SUPABASE_SERVICE_ROLE_KEY = "local-test-key";
try {
  const malformedConfigSample = await handleDiagnoseRequest(samplePayload);
  assert.equal(malformedConfigSample.status, 200);
  assert.equal(
    malformedConfigSample.body.warnings.includes(
      "错题本写入失败，本次诊断报告已保留。",
    ),
    true,
  );
  assert.equal(
    JSON.stringify(malformedConfigSample.body.warnings).includes(
      "local-test-key",
    ),
    false,
  );

  const malformedConfigConfirm = await handleConfirmRequest(
    createConfirmPayload(studentWorkExtraction),
  );
  assert.equal(malformedConfigConfirm.status, 200);
  assert.equal(
    malformedConfigConfirm.body.warnings.includes(
      "错题本写入失败，本次诊断报告已保留。",
    ),
    true,
  );
} finally {
  restoreEnv("SUPABASE_URL", originalSupabaseUrl);
  restoreEnv("SUPABASE_SERVICE_ROLE_KEY", originalSupabaseServiceRoleKey);
}

console.log("diagnosis persistence test passed");

function createRecordingRepository(options = {}) {
  return {
    calls: [],
    async persistDiagnosis(payload) {
      this.calls.push(payload);
      if (options.shouldThrow) {
        throw new Error("secret service role key should not leak");
      }

      return { status: "persisted" };
    },
  };
}

function createRecordingRpcClient(result) {
  return {
    calls: [],
    async rpc(name, params) {
      this.calls.push({ name, params });
      return result;
    },
  };
}

function createConfirmPayload(extraction, overrides = {}) {
  return {
    student_id: "demo_student_001",
    task_type: "confirmed_image_diagnosis",
    confirmation_token: createImageConfirmationToken({
      draft_id: `image_draft_${extraction.extraction_confidence}_${extraction.question_text.length}`,
      extraction_confidence: extraction.extraction_confidence,
      can_persist_after_confirmation:
        extraction.extraction_confidence !== "low",
      draft_fingerprint: createImageConfirmationFingerprint(extraction),
    }),
    confirmed_extraction: extraction,
    student_profile: demoStudentProfile,
    mistake_history: mistakeHistory,
    ...overrides,
  };
}

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
