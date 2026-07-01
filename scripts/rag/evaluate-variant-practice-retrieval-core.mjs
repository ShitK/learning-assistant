import { mkdir, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { validateVariantPracticeEvalReport } from "./variant-practice-eval-report-schema.mjs";

const evalVersion = "variant-practice-retrieval-quality-v0";
const corpusVersion = "enriched-practice-corpus-v0";
const mistakeCauseMethodTagMap = {
  classification_missing: ["parameter_range"],
  boundary_omission: ["parameter_range", "monotonicity"],
  range_boundary_omission: ["parameter_range", "monotonicity"],
  formula_misuse: ["tangent_slope", "derivative_geometric_meaning"],
  critical_point_missing: ["extrema"],
};

export async function buildVariantPracticeRetrievalEvalReport({
  cases,
  mode,
  generatedAt = new Date().toISOString(),
  runCase,
}) {
  const caseReports = [];
  for (const evalCase of cases) {
    const result = await runCase(evalCase);
    caseReports.push(buildCaseReport(evalCase, result));
  }

  const summary = summarizeCases(caseReports);
  const report = {
    eval_version: evalVersion,
    generated_at: generatedAt,
    mode,
    corpus_version: corpusVersion,
    case_count: caseReports.length,
    summary,
    cases: caseReports,
  };

  const validation = validateVariantPracticeEvalReport(report);
  if (!validation.ok) {
    throw new Error(`Invalid eval report: ${validation.errors.join("; ")}`);
  }

  return report;
}

export function buildCaseReport(evalCase, result) {
  const productItems = result.product_view_model?.items ?? [];
  const selectedCandidateItems = result.selected_candidate_items ?? [];
  const metrics = buildMetrics(evalCase, productItems, selectedCandidateItems);
  const findings = buildFindings(evalCase, result, metrics);
  const status = classifyCase(evalCase, result, metrics, findings);

  return {
    case_id: evalCase.id,
    status,
    retrieval_source: result.retrieval_source,
    pgvector_attempted: result.pgvector_attempted,
    display_source:
      productItems.length > 0 ? "variant_practice_api" : "diagnosis_practice_questions",
    candidate_count: result.candidate_count_before_agent,
    product_item_count: productItems.length,
    metrics,
    findings,
    debug: {
      candidate_count_after_approved_filter:
        result.candidate_count_after_approved_filter,
      question_text_preview: truncateDebugText(evalCase.request?.question_text ?? "", 200),
    },
  };
}

export function buildMetrics(evalCase, productItems, selectedCandidateItems) {
  const expectedSkills = new Set(evalCase.expected.required_target_skills);
  const expectedMethodTags = new Set([
    ...evalCase.expected.preferred_method_tags,
    ...mapMistakeCausesToMethodTags(evalCase.request?.mistake_causes ?? []),
  ]);
  const uniqueTypes = new Set(productItems.map((item) => item.type));
  const uniqueQuestions = new Set(productItems.map((item) => item.question_text));
  let requiredTargetSkillMatches = 0;
  let mistakeCauseAlignmentMatches = 0;
  let offTopicCount = 0;

  for (const item of selectedCandidateItems) {
    const skillSet = new Set([...(item.target_skills ?? []), ...(item.method_tags ?? [])]);
    if (intersects(skillSet, expectedSkills)) {
      requiredTargetSkillMatches += 1;
    }
    if (intersects(new Set(item.method_tags ?? []), expectedMethodTags)) {
      mistakeCauseAlignmentMatches += 1;
    }
    if (!Array.isArray(item.knowledge_points) || !item.knowledge_points.includes("derivative")) {
      offTopicCount += 1;
    }
  }

  return {
    required_target_skill_matches: requiredTargetSkillMatches,
    mistake_cause_alignment_matches: mistakeCauseAlignmentMatches,
    unique_item_count: uniqueQuestions.size,
    recommendation_type_coverage: Array.from(uniqueTypes),
    off_topic_count: offTopicCount,
  };
}

export function classifyCase(evalCase, result, metrics, findings) {
  if (evalCase.expected.min_items === 0) {
    return result.product_view_model ? "fail" : "pass";
  }
  if ((result.product_view_model?.items.length ?? 0) < evalCase.expected.min_items) {
    return "fail";
  }
  if (metrics.off_topic_count > 0) {
    return "fail";
  }
  if (
    metrics.required_target_skill_matches < 2 ||
    metrics.unique_item_count < evalCase.expected.min_items ||
    metrics.recommendation_type_coverage.length < 2
  ) {
    return "warn";
  }
  return findings.some((finding) => finding.severity === "fail") ? "fail" : "pass";
}

export function buildFindings(evalCase, result, metrics) {
  const findings = [];
  const candidateTargetSkillMatches = countTargetSkillMatches(
    result.candidate_items_after_filter ?? [],
    evalCase.expected.required_target_skills,
  );
  if (
    result.pgvector_attempted &&
    result.retrieval_source === "local_json" &&
    evalCase.expected.min_items > 0
  ) {
    findings.push({
      severity: "warn",
      reason: "fallback_triggered",
      message: "pgvector 路径未返回有效结果，已回退到本地 JSON corpus。",
    });
  }
  if (result.retrieval_source === null && evalCase.expected.min_items > 0) {
    findings.push({
      severity: "warn",
      reason: result.pgvector_attempted ? "corpus_gap" : "unsupported_scope",
      message: result.pgvector_attempted
        ? "pgvector 与本地 fallback 均未返回足够候选。"
        : "当前输入没有进入支持的导数 RAG scope。",
    });
  }
  if (metrics.off_topic_count > 0) {
    findings.push({
      severity: "fail",
      reason: "unsupported_scope",
      message: "推荐题中存在非导数候选。",
    });
  }
  if (metrics.required_target_skill_matches < 2 && evalCase.expected.min_items === 3) {
    findings.push({
      severity: "warn",
      reason: "metadata_gap",
      message: "最终 3 题对目标技能覆盖不足。",
    });
  }
  if (
    result.pgvector_attempted &&
    result.candidate_count_before_agent >= 3 &&
    metrics.required_target_skill_matches < 2 &&
    evalCase.expected.min_items === 3
  ) {
    findings.push({
      severity: "warn",
      reason: "vector_too_broad",
      message: "pgvector 召回候选足够，但最终题对目标技能覆盖不足。",
    });
  }
  if (
    candidateTargetSkillMatches >= 2 &&
    metrics.required_target_skill_matches < 2 &&
    evalCase.expected.min_items === 3
  ) {
    findings.push({
      severity: "warn",
      reason: "agent_slotting_gap",
      message: "候选中存在目标技能命中题，但最终推荐未选入足够目标题。",
    });
  }
  if (metrics.unique_item_count < (result.product_view_model?.items.length ?? 0)) {
    findings.push({
      severity: "warn",
      reason: "duplicate_items",
      message: "最终推荐中存在重复题干。",
    });
  }
  return findings;
}

function countTargetSkillMatches(items, requiredTargetSkills) {
  const expectedSkills = new Set(requiredTargetSkills);
  return items.filter((item) =>
    intersects(new Set([...(item.target_skills ?? []), ...(item.method_tags ?? [])]), expectedSkills),
  ).length;
}

export function summarizeCases(cases) {
  const pass = cases.filter((item) => item.status === "pass").length;
  const warn = cases.filter((item) => item.status === "warn").length;
  const fail = cases.filter((item) => item.status === "fail").length;
  const threeItemCount = cases.filter((item) => item.product_item_count === 3).length;
  const fallbackCount = cases.filter(
    (item) => item.pgvector_attempted && item.retrieval_source === "local_json",
  ).length;
  return {
    pass,
    warn,
    fail,
    three_item_rate: cases.length === 0 ? 0 : threeItemCount / cases.length,
    fallback_rate: cases.length === 0 ? 0 : fallbackCount / cases.length,
  };
}

export function truncateDebugText(text, maxLength) {
  return Array.from(String(text)).slice(0, maxLength).join("");
}

export function validateEvalOutputDir(outputDir) {
  const normalized = isAbsolute(outputDir)
    ? relative(process.cwd(), outputDir)
    : outputDir;
  if (
    normalized === "" ||
    normalized.startsWith("src/") ||
    normalized === "src" ||
    normalized.startsWith("app/") ||
    normalized === "app" ||
    normalized.startsWith("public/") ||
    normalized === "public" ||
    normalized.includes("localStorage")
  ) {
    return {
      ok: false,
      message: "eval output must not target source, app, public, or localStorage paths",
    };
  }
  return { ok: true };
}

export async function writeEvalReportFiles({ report, outputDir, writeLatest }) {
  const validation = validateVariantPracticeEvalReport(report);
  if (!validation.ok) {
    throw new Error(`Invalid eval report: ${validation.errors.join("; ")}`);
  }
  const outputValidation = validateEvalOutputDir(outputDir);
  if (!outputValidation.ok) {
    throw new Error(outputValidation.message);
  }

  await mkdir(outputDir, { recursive: true });
  const timestampName = `${formatTimestampForFile(report.generated_at)}.json`;
  const timestampPath = join(outputDir, timestampName);
  const text = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(timestampPath, text, "utf8");

  if (writeLatest) {
    const latestPath = join(outputDir, "latest.json");
    const tmpPath = join(outputDir, `.latest-${process.pid}.tmp`);
    await writeFile(tmpPath, text, "utf8");
    await rename(tmpPath, latestPath);
  }

  return { timestampPath };
}

function formatTimestampForFile(value) {
  return new Date(value).toISOString().slice(0, 19).replace(/:/g, "-") + "Z";
}

function mapMistakeCausesToMethodTags(mistakeCauses) {
  return mistakeCauses.flatMap((cause) => mistakeCauseMethodTagMap[cause] ?? []);
}

function intersects(left, right) {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }
  return false;
}
