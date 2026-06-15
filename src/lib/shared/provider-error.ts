import { isRecord } from "@/lib/shared/utils";

export type ProviderStage = "vision_llm" | "ocr";

export type ProviderFailureKind =
  | "http_error"
  | "invalid_json"
  | "empty_text_content"
  | "network_failed"
  | "timeout";

export interface ProviderFailureDebug {
  provider_name: string;
  provider_stage: ProviderStage;
  failure_kind: ProviderFailureKind;
  http_status?: number;
}

export function isProviderFailureDebug(
  value: unknown,
): value is ProviderFailureDebug {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.provider_name === "string" &&
    value.provider_name.trim().length > 0 &&
    isProviderStage(value.provider_stage) &&
    isProviderFailureKind(value.failure_kind) &&
    (value.http_status === undefined || typeof value.http_status === "number")
  );
}

function isProviderStage(value: unknown): value is ProviderStage {
  return value === "vision_llm" || value === "ocr";
}

function isProviderFailureKind(value: unknown): value is ProviderFailureKind {
  return (
    value === "http_error" ||
    value === "invalid_json" ||
    value === "empty_text_content" ||
    value === "network_failed" ||
    value === "timeout"
  );
}
