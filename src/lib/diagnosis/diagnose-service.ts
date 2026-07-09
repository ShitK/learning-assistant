import { createDiagnoseError, parseDiagnoseRequest } from "@/lib/diagnosis/diagnose-api";
import {
  runLearningMemoryAgent,
  persistDiagnosisIfNeeded,
} from "@/lib/diagnosis/agents/learning-memory-agent";
import { runSampleMistakeDiagnosisAgent } from "@/lib/diagnosis/agents/mistake-diagnosis-agent";
import { runVisionExtractionAgent } from "@/lib/diagnosis/agents/vision-extraction-agent";
import type {
  ParsedImageDiagnoseRequest,
} from "@/lib/diagnosis/diagnose-api";
import type {
  DiagnoseAgentResult,
  LearningMemoryAgentRepositories,
} from "@/lib/diagnosis/agents/diagnosis-agent-types";
import type {
  VisionExtractionProvider,
} from "@/lib/providers/anthropic-compatible-provider";

export type DiagnoseServiceResult = DiagnoseAgentResult;
export { persistDiagnosisIfNeeded };

export async function handleDiagnoseRequest(
  payload: unknown,
  deps?: {
    vision_provider?: VisionExtractionProvider;
  } & LearningMemoryAgentRepositories,
): Promise<DiagnoseServiceResult> {
  const parsedRequest = parseDiagnoseRequest(payload);
  if (!parsedRequest.ok) {
    return {
      status: 400,
      body: parsedRequest.response,
    };
  }

  if (parsedRequest.value.task_type === "sample_diagnosis") {
    try {
      return await runLearningMemoryAgent({
        result: {
          status: 200,
          body: runSampleMistakeDiagnosisAgent(parsedRequest.value),
        },
        persistence_repository: deps?.persistence_repository,
        student_profile_repository: deps?.student_profile_repository,
      });
    } catch {
      return {
        status: 400,
        body: createDiagnoseError(
          "unknown_sample_question_id",
          "未找到这个样例题，请重新选择。",
          true,
        ),
      };
    }
  }

  return handleImageDiagnoseRequest(parsedRequest.value, deps);
}

async function handleImageDiagnoseRequest(
  request: ParsedImageDiagnoseRequest,
  deps?: {
    vision_provider?: VisionExtractionProvider;
  },
): Promise<DiagnoseServiceResult> {
  return runVisionExtractionAgent({
    request,
    vision_provider: deps?.vision_provider,
  });
}
