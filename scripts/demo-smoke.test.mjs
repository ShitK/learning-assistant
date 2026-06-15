import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const { demoStudentProfile, mistakeHistory, sampleDiagnoses } = jiti(
  "../src/data/mathtrace-demo.ts",
);
const { runMathTraceAgent } = jiti("../src/lib/diagnosis/mathtrace-agent-pipeline.ts");
const { runImageMathTraceAgent } = jiti(
  "../src/lib/image-diagnosis/image-diagnosis-pipeline.ts",
);
const {
  createStandardSolutionBlocks,
  createStandardSolutionDisplayText,
} = jiti("../src/lib/diagnosis/diagnosis-view-model.ts");

const baseRequest = {
  student_id: "demo_student_001",
  student_profile: demoStudentProfile,
  mistake_history: mistakeHistory,
};

for (const sample of sampleDiagnoses) {
  const response = runMathTraceAgent({
    ...baseRequest,
    task_type: "sample_diagnosis",
    sample_question_id: sample.id,
    image_base64: null,
  });

  assert.equal(response.source, "sample", sample.id);
  assert.equal(response.fallback_used, false, sample.id);
  assert.equal(response.sample_diagnosis?.id, sample.id, sample.id);
  assert.equal(response.practice_questions.length, 3, sample.id);
  assert.equal(response.review_plan.seven_days.length, 7, sample.id);
}

const problemOnlyExtraction = {
  question_text:
    "已知函数 $f(x)=\\ln x-ax+1$，求单调区间，并讨论零点个数。",
  student_answer: "未识别到学生答案",
  student_solution_steps: [],
  extraction_confidence: "low",
  warnings: ["未识别到清晰学生步骤。"],
};
const rawStandardSolutionText =
  "**(1)** 求导得 $f'(x)=\\frac{1}{x}-a$，定义域为 $(0,+\\infty)$。\n- 当 $a\\le 0$ 时恒增。\n由 $f(\\frac{1}{a})= -\\ln a>0$ 得 $0<a<1$，即$\\ln a<0$。";
const followUpAnswer = {
  selected_stuck_point_id: "classification_missing",
  custom_text: null,
};

const problemOnlyReport = runImageMathTraceAgent({
  request: baseRequest,
  extraction: problemOnlyExtraction,
  is_extraction_confirmed: true,
  confirmation_action: "diagnose_from_student_work",
});

assert.equal(problemOnlyReport.evidence_level, "problem_only");
assert.equal(problemOnlyReport.persistence_evidence, "none");
assert.equal(problemOnlyReport.profile_update_kind, "none");
assert.equal(problemOnlyReport.memory_delta.should_persist, false);
assert.equal(problemOnlyReport.risk_follow_up?.prompt, "你主要卡在哪里？");
assert.equal(
  Object.keys(problemOnlyReport.memory_delta.mistake_cause_changes).length,
  0,
);

const skipReport = runImageMathTraceAgent({
  request: baseRequest,
  extraction: problemOnlyExtraction,
  is_extraction_confirmed: true,
  confirmation_action: "skip_follow_up",
});

assert.equal(skipReport.persistence_evidence, "uploaded_problem_only");
assert.equal(skipReport.profile_update_kind, "problem_type_focus");
assert.equal(skipReport.memory_delta.should_persist, true);
assert.equal(Object.keys(skipReport.memory_delta.mistake_cause_changes).length, 0);
for (const knowledgeId of skipReport.knowledge_mapping.knowledge_points) {
  assert.equal(skipReport.memory_delta.knowledge_mastery_changes[knowledgeId], -2);
}

const draftReport = runImageMathTraceAgent({
  request: baseRequest,
  extraction: problemOnlyExtraction,
  is_extraction_confirmed: true,
  confirmation_action: "submit_stuck_point",
  follow_up_answer: followUpAnswer,
});

assert.equal(draftReport.persistence_evidence, "none");
assert.equal(draftReport.profile_update_kind, "none");
assert.equal(draftReport.memory_delta.should_persist, false);
assert.equal(draftReport.risk_follow_up?.prompt, "你主要卡在哪里？");

const confirmedReport = runImageMathTraceAgent({
  request: baseRequest,
  extraction: problemOnlyExtraction,
  is_extraction_confirmed: true,
  confirmation_action: "confirm_stuck_point_analysis",
  follow_up_answer: followUpAnswer,
});

assert.equal(confirmedReport.persistence_evidence, "user_confirmed");
assert.equal(confirmedReport.profile_update_kind, "mistake_cause");
assert.equal(confirmedReport.memory_delta.should_persist, true);
assert.equal(
  Object.keys(confirmedReport.memory_delta.mistake_cause_changes).length > 0,
  true,
);

const displayText = createStandardSolutionDisplayText(
  rawStandardSolutionText,
);
const blocks = createStandardSolutionBlocks(
  rawStandardSolutionText,
);
const joinedBlocks = blocks.map((block) => block.text).join("\n");

assert.equal(displayText.includes("即$\\ln a"), false);
assert.equal(joinedBlocks.includes("**(1)**"), false);
assert.equal(joinedBlocks.includes("\n- 当"), false);
assert.equal(joinedBlocks.includes("(1) 求导得"), true);

console.log("demo smoke test passed");
