const DEFAULT_LIMIT = 8;
// P2.1 只覆盖导数题库；中文分词暂缓，先用目标技能和小词表做可解释召回。
const DERIVATIVE_SEARCH_TERMS = [
  "导数",
  "几何意义",
  "切线",
  "斜率",
  "极限",
  "单调",
  "极值",
  "零点",
  "不等式",
  "参数",
  "恒成立",
];

export function validatePracticeCorpus(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["corpus must be an object"] };
  }

  if (value.corpus_version !== "practice-corpus-v0") {
    errors.push("corpus_version must be practice-corpus-v0");
  }

  if (!Array.isArray(value.items)) {
    errors.push("items must be an array");
  } else {
    value.items.forEach((item, index) => validateCorpusItem(item, index, errors));
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, corpus: value };
}

export function normalizePracticeQuery(query) {
  const safeQuery = query && typeof query === "object" ? query : {};
  const questionText = typeof safeQuery.question_text === "string" ? safeQuery.question_text : "";
  const targetSkills = filterStringArray(safeQuery.target_skills);
  const sectionTitle =
    typeof safeQuery.section_title === "string" && safeQuery.section_title.trim()
      ? safeQuery.section_title.trim()
      : null;
  const knowledgePoints = filterStringArray(safeQuery.knowledge_points);
  const mistakeCauses = filterStringArray(safeQuery.mistake_causes);
  const searchTerms = buildSearchTerms({
    questionText,
    targetSkills,
    sectionTitle,
  });

  return {
    id: typeof safeQuery.id === "string" && safeQuery.id.trim() ? safeQuery.id : "practice-query",
    question_text: questionText,
    knowledge_points: knowledgePoints,
    section_title: sectionTitle,
    mistake_causes: mistakeCauses,
    target_skills: targetSkills,
    search_terms: searchTerms,
  };
}

export function searchPracticeCorpus({ corpus, query, limit = DEFAULT_LIMIT }) {
  const need = normalizePracticeQuery(query);
  if (need.search_terms.length === 0 && need.knowledge_points.length === 0 && !need.section_title) {
    return [];
  }

  return corpus.items
    .map((item) => scoreCorpusItem(item, need))
    .filter((candidate) => candidate.score > 0)
    .sort(compareCandidates)
    .slice(0, normalizeLimit(limit));
}

function scoreCorpusItem(item, need) {
  const matchedDimensions = [];
  const matchReasons = [];
  let score = 0;

  const itemKnowledgePoints = filterStringArray(item.knowledge_points);
  const knowledgeMatches = need.knowledge_points.filter((point) =>
    itemKnowledgePoints.includes(point),
  );
  if (knowledgeMatches.length > 0) {
    score += 8 * knowledgeMatches.length;
    matchedDimensions.push("knowledge_point");
    matchReasons.push(`同知识点 ${knowledgeMatches.join(", ")}`);
  }

  const itemSectionTitle =
    typeof item.section_title === "string" && item.section_title.trim()
      ? item.section_title
      : null;
  if (need.section_title && itemSectionTitle === need.section_title) {
    score += 5;
    matchedDimensions.push("section_title");
    matchReasons.push(`同章节：${itemSectionTitle}`);
  } else if (
    need.section_title &&
    itemSectionTitle &&
    hasSharedSectionPrefix(need.section_title, itemSectionTitle)
  ) {
    score += 2;
    matchedDimensions.push("section_title");
    matchReasons.push(`相关章节：${itemSectionTitle}`);
  }

  const searchable = `${item.question_text ?? ""}\n${item.search_text ?? ""}\n${itemSectionTitle ?? ""}`;
  for (const skill of need.target_skills) {
    if (searchable.includes(skill) || skillIncludesSearchableTerm(skill, searchable)) {
      score += 4;
      matchedDimensions.push("target_skill");
      matchReasons.push(`命中目标技能：${skill}`);
    }
  }

  const matchedTerms = need.search_terms.filter((term) => searchable.includes(term));
  if (matchedTerms.length > 0) {
    score += matchedTerms.length;
    matchedDimensions.push("query_term");
    matchReasons.push(`命中关键词：${[...new Set(matchedTerms)].slice(0, 5).join("、")}`);
  }

  return {
    item,
    score,
    matched_dimensions: [...new Set(matchedDimensions)],
    match_reasons: [...new Set(matchReasons)],
  };
}

function buildSearchTerms({ questionText, targetSkills, sectionTitle }) {
  const source = `${questionText}\n${targetSkills.join("\n")}\n${sectionTitle ?? ""}`;
  const terms = new Set();
  for (const skill of targetSkills) {
    if (skill.trim()) {
      terms.add(skill.trim());
    }
  }
  for (const term of DERIVATIVE_SEARCH_TERMS) {
    if (source.includes(term)) {
      terms.add(term);
    }
  }
  for (const token of source.match(/[A-Za-z][A-Za-z0-9_']*/g) ?? []) {
    if (token.length >= 2) {
      terms.add(token);
    }
  }
  return [...terms];
}

function skillIncludesSearchableTerm(skill, searchable) {
  return DERIVATIVE_SEARCH_TERMS.some((term) => skill.includes(term) && searchable.includes(term));
}

function hasSharedSectionPrefix(left, right) {
  return left.slice(0, 4) === right.slice(0, 4);
}

function compareCandidates(left, right) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  return String(left.item.id).localeCompare(String(right.item.id));
}

function normalizeLimit(limit) {
  return Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT;
}

function validateCorpusItem(item, index, errors) {
  const path = `item[${index}]`;
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    errors.push(`${path} must be an object`);
    return;
  }

  requireString(item, "id", errors, path);
  requireString(item, "source_candidate_id", errors, path);
  requireNonEmptyString(item, "question_text", errors, path);
  requireNonEmptyString(item, "search_text", errors, path);
  if (!Array.isArray(item.knowledge_points)) {
    errors.push(`${path}.knowledge_points must be an array`);
  }
  if ("source_ref" in item && item.source_ref !== null && typeof item.source_ref !== "object") {
    errors.push(`${path}.source_ref must be an object or null when present`);
  }
}

function requireString(value, key, errors, path) {
  if (typeof value[key] !== "string") {
    errors.push(`${path}.${key} must be a string`);
  }
}

function requireNonEmptyString(value, key, errors, path) {
  if (typeof value[key] !== "string" || !value[key].trim()) {
    errors.push(`${path}.${key} must be a non-empty string`);
  }
}

function filterStringArray(value) {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()),
        ),
      ]
    : [];
}
