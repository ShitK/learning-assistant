const CORPUS_VERSION = "practice-corpus-v0";
const DERIVATIVE_KNOWLEDGE_POINT = "derivative";

export function validateReviewedPracticeSeed(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["seed must be an object"] };
  }

  if (!Array.isArray(value.items)) {
    errors.push("items must be an array");
  } else {
    value.items.forEach((item, index) => {
      validateSeedItem(item, index, errors);
    });
  }

  if ("exported_at" in value && typeof value.exported_at !== "string") {
    errors.push("exported_at must be a string when present");
  }
  if ("approved_count" in value && typeof value.approved_count !== "number") {
    errors.push("approved_count must be a number when present");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, seed: value };
}

export function buildPracticeCorpus({ seed, sourceSeedFile, generatedAt }) {
  const items = seed.items
    .filter((item) => item.review_status === "reviewed")
    .filter((item) => String(item.question_text ?? "").trim())
    .map((item) => buildPracticeCorpusItem(item));

  return {
    corpus_version: CORPUS_VERSION,
    generated_at: generatedAt,
    source_seed_file: sourceSeedFile,
    source_seed_exported_at: seed.exported_at ?? null,
    item_count: items.length,
    items,
  };
}

function buildPracticeCorpusItem(item) {
  const sectionTitle = getSectionTitle(item);
  return {
    id: `practice-${item.candidate_id}`,
    source_candidate_id: item.candidate_id,
    question_text: item.question_text,
    search_text: buildDerivativeSearchText(item.question_text, sectionTitle),
    knowledge_points: [DERIVATIVE_KNOWLEDGE_POINT],
    section_title: sectionTitle,
    difficulty: normalizeDifficulty(item.difficulty),
    source_ref: item.source_ref ?? null,
    review_meta: {
      reviewed_seed_item_id: item.id,
      review_status: item.review_status,
      reviewer_note: typeof item.reviewer_note === "string" ? item.reviewer_note : "",
      has_manual_correction: item.has_manual_correction === true,
      original_question_text:
        typeof item.original_question_text === "string" ? item.original_question_text : "",
      seed_knowledge_points: Array.isArray(item.knowledge_points)
        ? item.knowledge_points.filter((value) => typeof value === "string")
        : [],
      original_extraction_confidence:
        typeof item.original_extraction_confidence === "string"
          ? item.original_extraction_confidence
          : null,
      original_warnings: Array.isArray(item.original_warnings)
        ? item.original_warnings.filter((value) => typeof value === "string")
        : [],
    },
  };
}

function buildDerivativeSearchText(questionText, sectionTitle) {
  return [questionText, "导数", sectionTitle]
    .filter((value) => typeof value === "string" && value.trim())
    .join("\n");
}

function getSectionTitle(item) {
  const sectionTitle = item?.source_ref?.section_title;
  return typeof sectionTitle === "string" && sectionTitle.trim() ? sectionTitle : null;
}

function normalizeDifficulty(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}

function validateSeedItem(item, index, errors) {
  const path = `item[${index}]`;
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    errors.push(`${path} must be an object`);
    return;
  }

  requireString(item, "id", errors, path);
  requireString(item, "candidate_id", errors, path);
  requireString(item, "review_status", errors, path);
  requireNonEmptyString(item, "question_text", errors, path);

  if ("original_question_text" in item && typeof item.original_question_text !== "string") {
    errors.push(`${path}.original_question_text must be a string when present`);
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
