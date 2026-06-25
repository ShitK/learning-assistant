import { normalizePracticeQuery, searchPracticeCorpus } from "./practice-corpus-search-core.mjs";

const AGENT_VERSION = "variant-practice-agent-v0";
const RECOMMENDATION_TYPES = ["foundation", "near_transfer", "mixed_application"];
const DEMO_FILL_RECOMMENDATION_TYPE = "additional_practice";

export function analyzePracticeNeed(query) {
  const need = normalizePracticeQuery(query);
  return {
    knowledge_points: need.knowledge_points,
    target_skills: need.target_skills,
    mistake_causes: need.mistake_causes,
    summary: buildPracticeGoalSummary(need),
  };
}

export function recommendVariantPractice({ corpus, query, searchLimit = 8 }) {
  const need = normalizePracticeQuery(query);
  const practiceGoal = analyzePracticeNeed(query);
  const candidates = searchPracticeCorpus({ corpus, query, limit: searchLimit });
  const selections = selectRecommendationCandidates(rankPracticeCandidates(candidates), need);
  const recommendations = selections.map((selection, index) => buildRecommendation(selection, index));
  const warnings = buildWarnings({ corpus, candidates, recommendations });

  return {
    agent_version: AGENT_VERSION,
    query_id: need.id,
    practice_goal: practiceGoal,
    agent_steps: buildAgentSteps({ practiceGoal, candidates, recommendations }),
    rationale: buildOverallRationale({ need, recommendations }),
    search_summary: {
      corpus_version: corpus?.corpus_version ?? null,
      searched_items: Array.isArray(corpus?.items) ? corpus.items.length : 0,
      candidate_count: candidates.length,
    },
    recommendations,
    warnings,
  };
}

function rankPracticeCandidates(candidates) {
  return [...candidates].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    const dimensionDelta =
      right.matched_dimensions.length - left.matched_dimensions.length;
    if (dimensionDelta !== 0) {
      return dimensionDelta;
    }
    return String(left.item.id).localeCompare(String(right.item.id));
  });
}

function selectRecommendationCandidates(candidates, need) {
  const selected = [];
  const usedIds = new Set();

  for (const recommendationType of RECOMMENDATION_TYPES) {
    const candidate = candidates.find(
      (candidateItem) =>
        !usedIds.has(candidateItem.item.id) &&
        isCandidateForType(candidateItem, need, recommendationType),
    );
    if (candidate) {
      selected.push({ recommendationType, candidate });
      usedIds.add(candidate.item.id);
    }
  }

  if (selected.length < 3) {
    const fallbackCandidate = selectDemoFillCandidate(candidates, usedIds);
    if (fallbackCandidate) {
      selected.push({
        recommendationType: DEMO_FILL_RECOMMENDATION_TYPE,
        candidate: fallbackCandidate,
      });
    }
  }

  return selected;
}

function selectDemoFillCandidate(candidates, usedIds) {
  const unusedCandidates = candidates.filter((candidate) => !usedIds.has(candidate.item.id));
  return (
    unusedCandidates.find((candidate) =>
      candidate.matched_dimensions.some((dimension) =>
        ["target_skill", "method_tag"].includes(dimension),
      ),
    ) ??
    unusedCandidates.find((candidate) => candidate.matched_dimensions.includes("knowledge_point")) ??
    null
  );
}

function isCandidateForType(candidate, need, recommendationType) {
  if (recommendationType === "foundation") {
    return isFoundationCandidate(candidate, need);
  }
  if (recommendationType === "near_transfer") {
    return isNearTransferCandidate(candidate, need);
  }
  return isMixedApplicationCandidate(candidate, need);
}

function isFoundationCandidate(candidate, need) {
  return (
    candidate.item.section_title === need.section_title &&
    candidate.matched_dimensions.includes("knowledge_point") &&
    candidate.matched_dimensions.includes("section_title")
  );
}

function isNearTransferCandidate(candidate, need) {
  return (
    candidate.item.section_title !== need.section_title &&
    candidate.matched_dimensions.includes("knowledge_point") &&
    candidate.matched_dimensions.includes("target_skill")
  );
}

function isMixedApplicationCandidate(candidate, need) {
  if (candidate.item.section_title === need.section_title) return false;
  if (!candidate.matched_dimensions.includes("knowledge_point")) return false;
  if (candidate.matched_dimensions.includes("target_skill")) return false;
  if (candidate.matched_dimensions.includes("method_tag")) return true;
  return !hasEnrichedTags(candidate.item);
}

function hasEnrichedTags(item) {
  return (
    Array.isArray(item.target_skills) ||
    Array.isArray(item.method_tags) ||
    Array.isArray(item.feature_flags)
  );
}

function buildRecommendation(selection, index) {
  const { candidate, recommendationType } = selection;
  return {
    rank: index + 1,
    recommendation_type: recommendationType,
    item_id: candidate.item.id,
    source_candidate_id: candidate.item.source_candidate_id,
    question_text: candidate.item.question_text,
    reason: buildRecommendationReason(candidate, recommendationType, index),
    matched_dimensions: candidate.matched_dimensions,
    score: candidate.score,
    source_ref: candidate.item.source_ref ?? null,
  };
}

function buildRecommendationReason(candidate, recommendationType, index) {
  const orderText = ["第一道", "第二道", "第三道"][index] ?? "后续";
  const typeText = {
    foundation: "巩固题",
    near_transfer: "轻微变式题",
    mixed_application: "迁移应用题",
    additional_practice: "补充练习题",
  }[recommendationType];
  const reasonText =
    candidate.match_reasons.length > 0
      ? candidate.match_reasons.slice(0, 2).join("；")
      : "与当前练习目标相关";
  return `${reasonText}，适合作为${orderText}${typeText}。`;
}

function buildPracticeGoalSummary(need) {
  const skillText =
    need.target_skills.length > 0 ? need.target_skills.join("、") : "当前知识点";
  const causeText =
    need.mistake_causes.length > 0 ? `针对 ${need.mistake_causes.join("、")}，` : "";
  return `${causeText}优先巩固${skillText}。`;
}

function buildAgentSteps({ practiceGoal, candidates, recommendations }) {
  return [
    {
      id: "analyze_practice_need",
      status: "completed",
      summary: `识别练习目标：${practiceGoal.target_skills.join("、") || "当前知识点"}。`,
    },
    {
      id: "search_corpus",
      status: "completed",
      summary: `从 practice_corpus 中召回 ${candidates.length} 道候选题。`,
    },
    {
      id: "rank_candidates",
      status: "completed",
      summary: "按同章节巩固、跨章节迁移和综合应用筛选候选题。",
    },
    {
      id: "build_recommendations",
      status: "completed",
      summary: `生成 ${recommendations.length} 道变式练习推荐。`,
    },
  ];
}

function buildOverallRationale({ need, recommendations }) {
  if (recommendations.length === 0) {
    return "当前 corpus 未找到足够相关的候选题，因此不强行推荐。";
  }

  const skillText =
    need.target_skills.length > 0 ? need.target_skills.join("、") : "当前知识点";
  const recommendationTypes = recommendations.map((recommendation) => recommendation.recommendation_type);
  const hasFoundation = recommendationTypes.includes("foundation");
  const hasNearTransfer = recommendationTypes.includes("near_transfer");
  const hasMixedApplication = recommendationTypes.includes("mixed_application");
  const hasDemoFill = recommendationTypes.includes(DEMO_FILL_RECOMMENDATION_TYPE);

  if (hasFoundation && hasNearTransfer && hasMixedApplication) {
    return `基于当前错因，先围绕同章节巩固${skillText}，再用跨章节题训练迁移，最后做综合应用。`;
  }
  if (hasDemoFill) {
    return `基于当前错因，先围绕同章节巩固${skillText}，再用跨章节题训练迁移；当前 corpus 暂时缺少稳定的综合应用题，因此补充同标签相近题用于演示练习链路。`;
  }
  if (hasFoundation && hasNearTransfer) {
    return `基于当前错因，先围绕同章节巩固${skillText}，再用跨章节题训练迁移；综合应用题当前 corpus 还不足以稳定推荐。`;
  }
  if (hasFoundation) {
    return `基于当前错因，先集中巩固同章节的${skillText}；后续等题源足够后再补充迁移题。`;
  }
  return `基于当前错因，当前 corpus 只找到部分相关候选题；建议先使用已推荐题目，后续补充题源后再扩展练习序列。`;
}

function buildWarnings({ corpus, candidates, recommendations }) {
  const warnings = [];
  if (recommendations.some((recommendation) => recommendation.recommendation_type === DEMO_FILL_RECOMMENDATION_TYPE)) {
    warnings.push("demo_fill_used");
  }
  if (candidates.length === 0) {
    warnings.push("no_candidates_found");
  } else if (isEnrichedCorpus(corpus) && recommendations.length < 3) {
    warnings.push("insufficient_approved_tagged_items");
    if (
      !recommendations.some(
        (recommendation) => recommendation.recommendation_type === "mixed_application",
      )
    ) {
      warnings.push("no_mixed_application_with_related_method_tags");
    }
  } else if (recommendations.length < 3) {
    warnings.push("insufficient_recommendations");
  }
  if (hasSkippedVisualItems(corpus)) warnings.push("skipped_visual_dependency_items");
  return warnings;
}

function isEnrichedCorpus(corpus) {
  return corpus?.corpus_version === "enriched-practice-corpus-v0";
}

function hasSkippedVisualItems(corpus) {
  return (corpus?.items ?? []).some(
    (item) => Array.isArray(item.feature_flags) && item.feature_flags.includes("needs_visual"),
  );
}
