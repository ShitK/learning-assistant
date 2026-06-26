import type { DiagnoseImageSuccessResponse } from "@/lib/diagnosis/diagnose-api";
import type { DynamicVariantPracticeRequest } from "@/lib/rag/dynamic-variant-practice-query";
import type { ProductVariantPractice } from "@/lib/rag/variant-practice-product-view-model";
import { isRecord } from "@/lib/shared/utils";

export function buildDynamicVariantPracticePayload(
  input: DiagnoseImageSuccessResponse,
): DynamicVariantPracticeRequest {
  const questionText =
    typeof input.recognized_question?.question_text === "string"
      ? input.recognized_question.question_text
      : "";
  const knowledgePoints = Array.isArray(input.knowledge_mapping?.knowledge_points)
    ? input.knowledge_mapping.knowledge_points
    : [];
  const mistakeCauses = Array.isArray(input.mistake_diagnosis?.mistake_causes)
    ? input.mistake_diagnosis.mistake_causes
    : [];

  return {
    student_id: "demo_student_001",
    request_source: "confirmed_image_diagnosis",
    evidence_level: input.evidence_level,
    persistence_evidence: input.persistence_evidence,
    profile_update_kind: input.profile_update_kind,
    question_text: questionText,
    knowledge_points: knowledgePoints,
    mistake_causes: mistakeCauses,
  };
}

export async function requestDynamicVariantPractice(input: {
  fetcher: typeof fetch;
  diagnosis: DiagnoseImageSuccessResponse;
}): Promise<ProductVariantPractice | null> {
  const payload = buildDynamicVariantPracticePayload(input.diagnosis);
  if (!payload.question_text.trim()) {
    return null;
  }

  let response: Response;
  try {
    response = await input.fetcher("/api/variant-practice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify(payload),
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const responseBody = await readJsonResponse(response);
  if (!isRecord(responseBody)) {
    return null;
  }

  return isProductVariantPractice(responseBody.variant_practice)
    ? responseBody.variant_practice
    : null;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isProductVariantPractice(
  value: unknown,
): value is ProductVariantPractice {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.source === "rag_variant_practice" &&
    (value.notice === null || typeof value.notice === "string") &&
    Array.isArray(value.items) &&
    value.items.length === 3 &&
    value.items.every(isProductVariantPracticeItem)
  );
}

function isProductVariantPracticeItem(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.rank === "number" &&
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    typeof value.question_text === "string" &&
    typeof value.reason === "string"
  );
}
