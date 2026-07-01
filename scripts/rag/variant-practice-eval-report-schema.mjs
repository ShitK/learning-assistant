const allowedModes = new Set(["local_only", "pgvector_preferred"]);
const allowedStatuses = new Set(["pass", "warn", "fail"]);
const allowedRetrievalSources = new Set(["pgvector", "local_json", null]);
const allowedDisplaySources = new Set([
  "variant_practice_api",
  "diagnosis_practice_questions",
  "none",
]);
const allowedFindingSeverities = new Set(["info", "warn", "fail"]);

export function validateVariantPracticeEvalReport(value) {
  const errors = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ["report must be an object"] };
  }

  requireEqual(value.eval_version, "variant-practice-retrieval-quality-v0", "eval_version", errors);
  requireString(value.generated_at, "generated_at", errors);
  requireOneOf(value.mode, allowedModes, "mode", errors);
  requireEqual(value.corpus_version, "enriched-practice-corpus-v0", "corpus_version", errors);
  requireNumber(value.case_count, "case_count", errors);
  validateSummary(value.summary, errors);

  if (!Array.isArray(value.cases)) {
    errors.push("cases must be an array");
  } else {
    if (value.case_count !== value.cases.length) {
      errors.push("case_count must equal cases.length");
    }
    value.cases.forEach((item, index) => validateCase(item, index, errors));
  }

  return errors.length === 0 ? { ok: true, value } : { ok: false, errors };
}

function validateSummary(value, errors) {
  if (!isRecord(value)) {
    errors.push("summary must be an object");
    return;
  }
  for (const field of ["pass", "warn", "fail", "three_item_rate", "fallback_rate"]) {
    requireNumber(value[field], `summary.${field}`, errors);
  }
}

function validateCase(value, index, errors) {
  if (!isRecord(value)) {
    errors.push(`cases[${index}] must be an object`);
    return;
  }
  requireString(value.case_id, `cases[${index}].case_id`, errors);
  requireOneOf(value.status, allowedStatuses, `cases[${index}].status`, errors);
  requireOneOf(
    value.retrieval_source,
    allowedRetrievalSources,
    `cases[${index}].retrieval_source`,
    errors,
  );
  requireOneOf(
    value.display_source,
    allowedDisplaySources,
    `cases[${index}].display_source`,
    errors,
  );
  requireBoolean(value.pgvector_attempted, `cases[${index}].pgvector_attempted`, errors);
  requireNumber(value.candidate_count, `cases[${index}].candidate_count`, errors);
  requireNumber(value.product_item_count, `cases[${index}].product_item_count`, errors);
  if (!isRecord(value.metrics)) {
    errors.push(`cases[${index}].metrics must be an object`);
  } else {
    requireNumber(
      value.metrics.required_target_skill_matches,
      `cases[${index}].metrics.required_target_skill_matches`,
      errors,
    );
    requireNumber(
      value.metrics.mistake_cause_alignment_matches,
      `cases[${index}].metrics.mistake_cause_alignment_matches`,
      errors,
    );
    requireNumber(value.metrics.unique_item_count, `cases[${index}].metrics.unique_item_count`, errors);
    requireStringArray(
      value.metrics.recommendation_type_coverage,
      `cases[${index}].metrics.recommendation_type_coverage`,
      errors,
    );
    requireNumber(value.metrics.off_topic_count, `cases[${index}].metrics.off_topic_count`, errors);
  }
  if (!Array.isArray(value.findings)) {
    errors.push(`cases[${index}].findings must be an array`);
  } else {
    value.findings.forEach((finding, findingIndex) =>
      validateFinding(finding, index, findingIndex, errors),
    );
  }
}

function validateFinding(value, caseIndex, findingIndex, errors) {
  if (!isRecord(value)) {
    errors.push(`cases[${caseIndex}].findings[${findingIndex}] must be an object`);
    return;
  }
  requireOneOf(
    value.severity,
    allowedFindingSeverities,
    `cases[${caseIndex}].findings[${findingIndex}].severity`,
    errors,
  );
  requireString(value.reason, `cases[${caseIndex}].findings[${findingIndex}].reason`, errors);
  requireString(value.message, `cases[${caseIndex}].findings[${findingIndex}].message`, errors);
}

function requireString(value, field, errors) {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${field} must be a non-empty string`);
  }
}

function requireBoolean(value, field, errors) {
  if (typeof value !== "boolean") {
    errors.push(`${field} must be a boolean`);
  }
}

function requireNumber(value, field, errors) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${field} must be a finite number`);
  }
}

function requireStringArray(value, field, errors) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    errors.push(`${field} must be an array of non-empty strings`);
  }
}

function requireEqual(value, expected, field, errors) {
  if (value !== expected) {
    errors.push(`${field} must be ${expected}`);
  }
}

function requireOneOf(value, allowedValues, field, errors) {
  if (!allowedValues.has(value)) {
    errors.push(`${field} must be one of ${Array.from(allowedValues).join(", ")}`);
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
