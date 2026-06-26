import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const {
  buildDynamicVariantPracticePayload,
  requestDynamicVariantPractice,
} = jiti("./src/lib/rag/dynamic-variant-practice-client.ts");
const { demoStudentProfile } = jiti("./src/data/mathtrace-demo.ts");

const diagnosis = {
  diagnosis_id: "diag_image_dynamic",
  student_id: "demo_student_001",
  source: "image",
  steps: [],
  recognized_question: {
    id: "image_dynamic_1",
    title: "图片识别错题",
    module: "导数",
    question_text: "已知函数 $f(x)=\\ln x-ax+1$，讨论函数单调性。",
    student_answer: "遗漏参数讨论。",
    student_solution_steps: ["求导", "直接判断"],
    extraction_confidence: "high",
  },
  knowledge_mapping: {
    knowledge_points: ["derivative_monotonicity"],
    difficulty: 4,
  },
  mistake_diagnosis: {
    mistake_causes: ["classification_missing"],
    severity: "medium",
    expected_diagnosis: "分类讨论遗漏。",
    step_analysis: ["没有讨论参数范围"],
    solution_highlights: ["先讨论参数范围"],
    standard_solution: "先求导，再分类讨论。",
  },
  memory_delta: {
    knowledge_mastery_changes: { derivative_monotonicity: -6 },
    mistake_cause_changes: { classification_missing: 1 },
    is_repeated_mistake: false,
    review_priority_changes: ["derivative_monotonicity"],
    should_persist: true,
    rationale: "图片抽取通过校验后，由本地规则计算画像增量。",
  },
  student_profile: demoStudentProfile,
  practice_questions: [],
  review_plan: {
    tomorrow: "复习导数单调性。",
    seven_days: [],
    rationale: ["本次错因涉及导数。"],
  },
  sample_diagnosis: null,
  fallback_used: false,
  evidence_level: "student_work_sufficient",
  persistence_evidence: "student_work",
  profile_update_kind: "mistake_cause",
  risk_follow_up: null,
  warnings: [],
};

{
  const payload = buildDynamicVariantPracticePayload(diagnosis);
  assert.equal(payload.student_id, "demo_student_001");
  assert.equal(payload.request_source, "confirmed_image_diagnosis");
  assert.equal(payload.evidence_level, "student_work_sufficient");
  assert.equal(payload.persistence_evidence, "student_work");
  assert.equal(payload.profile_update_kind, "mistake_cause");
  assert.equal(payload.question_text, diagnosis.recognized_question.question_text);
  assert.deepEqual(payload.knowledge_points, ["derivative_monotonicity"]);
  assert.deepEqual(payload.mistake_causes, ["classification_missing"]);
}

{
  const payload = buildDynamicVariantPracticePayload({
    ...diagnosis,
    recognized_question: undefined,
    knowledge_mapping: undefined,
    mistake_diagnosis: undefined,
  });
  assert.equal(payload.question_text, "");
  assert.deepEqual(payload.knowledge_points, []);
  assert.deepEqual(payload.mistake_causes, []);
}

{
  const result = await requestDynamicVariantPractice({
    fetcher: createJsonFetcher({
      ok: true,
      body: {
        variant_practice: {
          source: "rag_variant_practice",
          notice: null,
          items: [
            {
              rank: 1,
              type: "foundation",
              title: "巩固题",
              question_text: "1. 动态巩固题。",
              reason: "先巩固。",
            },
            {
              rank: 2,
              type: "near_transfer",
              title: "迁移题",
              question_text: "2. 动态迁移题。",
              reason: "再迁移。",
            },
            {
              rank: 3,
              type: "mixed_application",
              title: "综合题",
              question_text: "3. 动态综合题。",
              reason: "最后综合。",
            },
          ],
        },
      },
    }),
    diagnosis,
  });
  assert.notEqual(result, null);
  assert.equal(result.items[0].title, "巩固题");
}

{
  const result = await requestDynamicVariantPractice({
    fetcher: createJsonFetcher({
      ok: true,
      body: {
        variant_practice: {
          source: "rag_variant_practice",
          notice: null,
          items: [
            {
              rank: 1,
              type: "foundation",
              title: "不足三题",
              question_text: "1. 不足三题。",
              reason: "不应展示。",
            },
          ],
        },
      },
    }),
    diagnosis,
  });
  assert.equal(result, null);
}

{
  let didFetch = false;
  const result = await requestDynamicVariantPractice({
    fetcher: async () => {
      didFetch = true;
      throw new Error("should not fetch");
    },
    diagnosis: {
      ...diagnosis,
      recognized_question: {
        ...diagnosis.recognized_question,
        question_text: "   ",
      },
    },
  });
  assert.equal(result, null);
  assert.equal(didFetch, false);
}

{
  let didFetch = false;
  const result = await requestDynamicVariantPractice({
    fetcher: async () => {
      didFetch = true;
      throw new Error("should not fetch");
    },
    diagnosis: {
      ...diagnosis,
      recognized_question: undefined,
    },
  });
  assert.equal(result, null);
  assert.equal(didFetch, false);
}

{
  const result = await requestDynamicVariantPractice({
    fetcher: createJsonFetcher({ ok: true, body: { variant_practice: null } }),
    diagnosis,
  });
  assert.equal(result, null);
}

{
  const result = await requestDynamicVariantPractice({
    fetcher: createJsonFetcher({ ok: false, body: { error: { message: "bad" } } }),
    diagnosis,
  });
  assert.equal(result, null);
}

{
  const result = await requestDynamicVariantPractice({
    fetcher: async () => {
      throw new Error("network failed");
    },
    diagnosis,
  });
  assert.equal(result, null);
}

console.log("dynamic variant practice client tests passed");

function createJsonFetcher({ ok, body }) {
  return async (url, init) => {
    assert.equal(url, "/api/variant-practice");
    assert.equal(init.method, "POST");
    assert.equal(init.cache, "no-store");
    assert.equal(init.headers["Content-Type"], "application/json");
    const payload = JSON.parse(init.body);
    assert.equal(payload.request_source, "confirmed_image_diagnosis");
    return {
      ok,
      async json() {
        return body;
      },
    };
  };
}
