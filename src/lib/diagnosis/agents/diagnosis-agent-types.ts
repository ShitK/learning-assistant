import type { DiagnoseApiResponse } from "@/lib/diagnosis/diagnose-api";
import type { DiagnosisPersistenceRepository } from "@/lib/persistence/diagnosis-persistence";
import type { StudentProfileProjectionRepository } from "@/lib/persistence/student-profile-persistence";

export interface DiagnoseAgentResult {
  status: number;
  body: DiagnoseApiResponse;
}

export interface LearningMemoryAgentRepositories {
  persistence_repository?: DiagnosisPersistenceRepository;
  student_profile_repository?: StudentProfileProjectionRepository;
}
