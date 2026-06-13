import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const {
  assessExtractionEvidence,
  createProblemRiskFollowUp,
  parseFollowUpAnswer,
} = jiti("../src/lib/diagnosis-evidence.ts");

const sufficient = assessExtractionEvidence({
  question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
  student_answer: "$f'(x)=3x^2-3a$，只得到 $x=\\sqrt a$。",
  student_solution_steps: ["求导正确", "只写一个临界点", "没有讨论 $a\\le 0$"],
  standard_solution_draft: "应讨论 $a\\le 0$ 与 $a>0$。",
  extraction_confidence: "high",
  warnings: [],
});

assert.equal(sufficient.evidence_level, "student_work_sufficient");
assert.equal(sufficient.persistence_evidence, "student_work");
assert.equal(sufficient.profile_update_kind, "mistake_cause");
assert.equal(sufficient.can_write_mistake_cause, true);
assert.equal(sufficient.should_prompt_for_stuck_point, false);

const problemOnly = assessExtractionEvidence({
  question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
  student_answer: "未识别到学生答案",
  student_solution_steps: [],
  standard_solution_draft: "应讨论 $a\\le 0$ 与 $a>0$。",
  extraction_confidence: "low",
  warnings: ["没有识别到学生作答区域。"],
});

assert.equal(problemOnly.evidence_level, "problem_only");
assert.equal(problemOnly.persistence_evidence, "uploaded_problem_only");
assert.equal(problemOnly.profile_update_kind, "problem_type_focus");
assert.equal(problemOnly.can_write_mistake_cause, false);
assert.equal(problemOnly.should_prompt_for_stuck_point, true);

const problemOnlyWithoutStandardSolutionDraft = assessExtractionEvidence({
  question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
  student_answer: "未识别到学生答案",
  student_solution_steps: [],
  standard_solution_draft: "",
  extraction_confidence: "low",
  warnings: ["没有识别到学生作答区域。"],
});

assert.equal(
  problemOnlyWithoutStandardSolutionDraft.evidence_level,
  "problem_only",
);
assert.equal(
  problemOnlyWithoutStandardSolutionDraft.profile_update_kind,
  "problem_type_focus",
);

const insufficient = assessExtractionEvidence({
  question_text: "",
  student_answer: "未识别到学生答案",
  student_solution_steps: [],
  standard_solution_draft: "",
  extraction_confidence: "low",
  warnings: [],
});

assert.equal(insufficient.evidence_level, "insufficient");
assert.equal(insufficient.persistence_evidence, "none");
assert.equal(insufficient.profile_update_kind, "none");

const followUp = createProblemRiskFollowUp({
  extraction: {
    question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
    student_answer: "未识别到学生答案",
    student_solution_steps: [],
    standard_solution_draft: "先求导，再按 $a\\le 0$ 和 $a>0$ 分类讨论。",
    extraction_confidence: "low",
    warnings: [],
  },
  knowledge_points: ["derivative_monotonicity", "parameter_classification"],
  mistake_causes: ["classification_missing", "domain_missing"],
});

assert.equal(followUp.common_stuck_points.length > 0, true);
assert.equal(followUp.knowledge_points.includes("parameter_classification"), true);
assert.equal(followUp.prompt, "你主要卡在哪里？");

const parsedChoice = parseFollowUpAnswer({
  selected_stuck_point_id: followUp.common_stuck_points[0].id,
  custom_text: "",
});

assert.equal(parsedChoice.ok, true);
assert.equal(
  parsedChoice.value.selected_stuck_point_id,
  followUp.common_stuck_points[0].id,
);

const parsedCustom = parseFollowUpAnswer({
  selected_stuck_point_id: null,
  custom_text: "我不知道为什么要分类讨论参数。",
});

assert.equal(parsedCustom.ok, true);
assert.equal(parsedCustom.value.custom_text, "我不知道为什么要分类讨论参数。");

const parsedSkip = parseFollowUpAnswer(null);

assert.equal(parsedSkip.ok, true);
assert.deepEqual(parsedSkip.value, {
  selected_stuck_point_id: null,
  custom_text: null,
});

console.log("diagnosis evidence test passed");
