import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const {
  deriveDynamicVariantPracticeQuery,
  parseDynamicVariantPracticeRequest,
} = jiti("./src/lib/rag/dynamic-variant-practice-query.ts");

const baseRequest = {
  student_id: "demo_student_001",
  request_source: "confirmed_image_diagnosis",
  evidence_level: "student_work_sufficient",
  persistence_evidence: "student_work",
  profile_update_kind: "mistake_cause",
  question_text: "已知函数 $f(x)=\\ln x-ax+1$，讨论函数单调性并求参数范围。",
  knowledge_points: ["derivative_monotonicity"],
  mistake_causes: ["classification_missing"],
};

{
  const parsed = parseDynamicVariantPracticeRequest(baseRequest);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.student_id, "demo_student_001");
  assert.equal(parsed.value.request_source, "confirmed_image_diagnosis");
}

{
  const query = deriveDynamicVariantPracticeQuery(baseRequest);
  assert.notEqual(query, null);
  assert.equal(query.id, "dynamic-confirmed-image-diagnosis");
  assert.deepEqual(query.knowledge_points, ["derivative"]);
  assert.equal(query.target_skills.includes("monotonicity"), true);
  assert.equal(query.target_skills.includes("parameter_range"), true);
  assert.equal(query.section_title, "考点 2 导数与函数的单调性");
  assert.deepEqual(query.mistake_causes, ["classification_missing"]);
}

{
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    knowledge_points: ["parameter_classification"],
    mistake_causes: [],
  });
  assert.notEqual(query, null);
  assert.deepEqual(query.target_skills, ["parameter_range"]);
  assert.equal(query.section_title, "专项突破 2 利用导数研究恒(能)成立问题");
}

{
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    knowledge_points: ["derivative_monotonicity", "parameter_classification"],
    mistake_causes: [],
  });
  assert.notEqual(query, null);
  assert.deepEqual(query.target_skills, ["monotonicity", "parameter_range"]);
  assert.equal(query.section_title, "考点 2 导数与函数的单调性");
}

{
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    question_text: "已知曲线在某点处的切线斜率，求导数几何意义。",
    knowledge_points: ["derivative_monotonicity"],
    mistake_causes: [],
  });
  assert.notEqual(query, null);
  assert.equal(query.target_skills.includes("tangent_slope"), true);
  assert.equal(query.target_skills.includes("derivative_geometric_meaning"), true);
}

{
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    question_text: "讨论函数零点个数。",
    knowledge_points: ["derivative_monotonicity"],
    mistake_causes: [],
  });
  assert.notEqual(query, null);
  assert.equal(query.target_skills.includes("zero_point"), true);
}

{
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    knowledge_points: ["sequence_recursion"],
    mistake_causes: ["classification_missing"],
  });
  assert.equal(query, null);
}

{
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    knowledge_points: ["function_domain", "sequence_recursion"],
    mistake_causes: [],
  });
  assert.equal(query, null);
}

{
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    knowledge_points: ["function_domain", "derivative_monotonicity"],
    mistake_causes: [],
  });
  assert.notEqual(query, null);
  assert.equal(query.target_skills.includes("monotonicity"), true);
}

{
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    evidence_level: "problem_only",
    persistence_evidence: "uploaded_problem_only",
    profile_update_kind: "problem_type_focus",
  });
  assert.notEqual(query, null);
  assert.equal(query.target_skills.includes("monotonicity"), true);
}

{
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    evidence_level: "problem_only",
    persistence_evidence: "none",
    profile_update_kind: "problem_type_focus",
  });
  assert.equal(query, null);
}

{
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    evidence_level: "problem_only",
    persistence_evidence: "user_confirmed",
    profile_update_kind: "mistake_cause",
  });
  assert.notEqual(query, null);
}

{
  const longText = "导数".repeat(500);
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    question_text: longText,
  });
  assert.notEqual(query, null);
  assert.equal(Array.from(query.question_text).length, 800);
}

for (const badRequest of [
  null,
  { ...baseRequest, student_id: "student_002" },
  { ...baseRequest, request_source: "image" },
  { ...baseRequest, question_text: "" },
  { ...baseRequest, knowledge_points: "derivative_monotonicity" },
  { ...baseRequest, mistake_causes: "classification_missing" },
]) {
  const parsed = parseDynamicVariantPracticeRequest(badRequest);
  assert.equal(parsed.ok, false);
}

console.log("dynamic variant practice query tests passed");
