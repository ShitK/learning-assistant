import {
  DATABASE_NOT_CONFIGURED_WARNING,
  DATABASE_WRITE_FAILED_WARNING,
  DUPLICATE_MISTAKE_BOOK_ITEM_WARNING,
  persistDiagnosisResponse,
} from "@/lib/persistence/diagnosis-persistence";
import {
  PROFILE_SYNC_FAILED_WARNING,
  syncProjectedStudentProfile,
} from "@/lib/student-profile/student-profile-service";
import { isRecord } from "@/lib/shared/utils";
import type {
  DiagnoseApiResponse,
  DiagnoseSuccessResponse,
} from "@/lib/diagnosis/diagnose-api";
import type { DiagnoseImageSuccessResponse } from "@/lib/shared/diagnosis-result-types";
import type { DiagnosisPersistenceResult } from "@/lib/persistence/diagnosis-persistence";
import type {
  DiagnoseAgentResult,
  LearningMemoryAgentRepositories,
} from "@/lib/diagnosis/agents/diagnosis-agent-types";

export async function runLearningMemoryAgent(
  input: {
    result: DiagnoseAgentResult;
  } & LearningMemoryAgentRepositories,
): Promise<DiagnoseAgentResult> {
  return persistDiagnosisIfNeeded(
    input.result,
    input.persistence_repository,
    input.student_profile_repository,
  );
}

export async function persistDiagnosisIfNeeded(
  result: DiagnoseAgentResult,
  repository?: LearningMemoryAgentRepositories["persistence_repository"],
  studentProfileRepository?: LearningMemoryAgentRepositories["student_profile_repository"],
): Promise<DiagnoseAgentResult> {
  if (!isPersistableDiagnosisResponse(result.body)) {
    return result;
  }

  const persistenceResult = await persistDiagnosisResponse(
    result.body,
    repository,
  );
  const warnings: string[] = [];
  const persistenceWarning = getPersistenceWarning(persistenceResult);
  if (persistenceWarning) {
    warnings.push(persistenceWarning);
  }

  if (persistenceResult.status === "persisted") {
    const profileSync = await syncProjectedStudentProfile(
      result.body.student_id,
      studentProfileRepository,
    );
    if (profileSync.status === "failed") {
      warnings.push(profileSync.warning ?? PROFILE_SYNC_FAILED_WARNING);
    }
  }

  if (warnings.length === 0) {
    return result;
  }

  return {
    ...result,
    body: {
      ...result.body,
      warnings: appendUniqueWarnings(result.body.warnings, warnings),
    },
  };
}

function isPersistableDiagnosisResponse(
  body: DiagnoseApiResponse,
): body is DiagnoseSuccessResponse | DiagnoseImageSuccessResponse {
  return (
    isRecord(body) &&
    (body.source === "sample" || body.source === "image") &&
    "memory_delta" in body &&
    "student_profile" in body
  );
}

function getPersistenceWarning(
  result: DiagnosisPersistenceResult,
): string | null {
  if (result.status === "disabled") {
    return DATABASE_NOT_CONFIGURED_WARNING;
  }

  if (result.status === "failed") {
    return DATABASE_WRITE_FAILED_WARNING;
  }

  if (result.status === "duplicate") {
    return DUPLICATE_MISTAKE_BOOK_ITEM_WARNING;
  }

  return null;
}

function appendUniqueWarning(warnings: string[], warning: string): string[] {
  return warnings.includes(warning) ? warnings : [...warnings, warning];
}

function appendUniqueWarnings(
  warnings: string[],
  nextWarnings: string[],
): string[] {
  return nextWarnings.reduce(appendUniqueWarning, warnings);
}
