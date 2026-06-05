import { createHmac, timingSafeEqual } from "node:crypto";
import { isRecord } from "@/lib/utils";
import type {
  ExtractionConfidence,
  VisionExtractionDraft,
} from "@/lib/vision-extraction-parser";

export interface ImageConfirmationTokenPayload {
  draft_id: string;
  extraction_confidence: ExtractionConfidence;
  can_persist_after_confirmation: boolean;
  draft_fingerprint: string;
}

export function createImageConfirmationToken(
  payload: ImageConfirmationTokenPayload,
): string {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signTokenPayload(
    encodedPayload,
    getRequiredConfirmationSecret(),
  );

  return `${encodedPayload}.${signature}`;
}

export function createImageConfirmationFingerprint(
  extraction: VisionExtractionDraft,
): string {
  return createHmac("sha256", getRequiredConfirmationSecret())
    .update(canonicalizeExtractionDraft(extraction))
    .digest("base64url");
}

export function verifyImageConfirmationToken(
  token: string,
): { ok: true; value: ImageConfirmationTokenPayload } | { ok: false } {
  const secret = getConfirmationSecret();
  if (!secret) {
    return { ok: false };
  }

  const parts = token.split(".");
  if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
    return { ok: false };
  }

  const [encodedPayload, signature] = parts;
  const expectedSignature = signTokenPayload(encodedPayload, secret);
  if (!isSameSignature(signature, expectedSignature)) {
    return { ok: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeBase64Url(encodedPayload));
  } catch {
    return { ok: false };
  }

  if (!isImageConfirmationTokenPayload(parsed)) {
    return { ok: false };
  }

  return { ok: true, value: parsed };
}

function signTokenPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
}

function getRequiredConfirmationSecret(): string {
  const secret = getConfirmationSecret();
  if (!secret) {
    throw new Error("MATHTRACE_CONFIRM_SECRET is required in production.");
  }

  return secret;
}

function getConfirmationSecret(): string | null {
  if (process.env.NODE_ENV === "production") {
    return process.env.MATHTRACE_CONFIRM_SECRET ?? null;
  }

  const configuredSecret =
    process.env.MATHTRACE_CONFIRM_SECRET ??
    process.env.VISION_PROVIDER_API_KEY ??
    process.env.MIMO_API_KEY;

  if (configuredSecret) {
    return configuredSecret;
  }

  return "mathtrace-demo-confirmation-token-v1";
}

function isImageConfirmationTokenPayload(
  value: unknown,
): value is ImageConfirmationTokenPayload {
  if (!isRecord(value)) {
    return false;
  }

  if (!isNonEmptyString(value.draft_id)) {
    return false;
  }

  if (!isExtractionConfidence(value.extraction_confidence)) {
    return false;
  }

  if (typeof value.can_persist_after_confirmation !== "boolean") {
    return false;
  }

  if (!isNonEmptyString(value.draft_fingerprint)) {
    return false;
  }

  return (
    value.can_persist_after_confirmation ===
    (value.extraction_confidence !== "low")
  );
}

function canonicalizeExtractionDraft(extraction: VisionExtractionDraft): string {
  return JSON.stringify({
    question_text: extraction.question_text,
    student_answer: extraction.student_answer,
    student_solution_steps: extraction.student_solution_steps,
    standard_solution_draft: extraction.standard_solution_draft,
    extraction_confidence: extraction.extraction_confidence,
    warnings: extraction.warnings,
  });
}

function isSameSignature(signature: string, expectedSignature: string): boolean {
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expectedSignature);

  return (
    signatureBytes.length === expectedBytes.length &&
    timingSafeEqual(signatureBytes, expectedBytes)
  );
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function isExtractionConfidence(
  value: unknown,
): value is ExtractionConfidence {
  return value === "high" || value === "medium" || value === "low";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
