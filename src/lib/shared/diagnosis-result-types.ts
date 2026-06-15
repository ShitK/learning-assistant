import type {
  AgentStep,
  MemoryDelta,
  PracticeQuestion,
  ReviewPlan,
  Severity,
  StudentProfile,
} from "@/data/mathtrace-demo";
import type {
  EvidenceLevel,
  PersistenceEvidence,
  ProblemRiskFollowUp,
  ProfileUpdateKind,
} from "@/lib/shared/diagnosis-evidence";

export interface ImageRecognizedQuestion {
  id: string;
  title: string;
  module: string;
  question_text: string;
  student_answer: string;
  student_solution_steps: string[];
  extraction_confidence: "high" | "medium" | "low";
}

export interface KnowledgeMapping {
  knowledge_points: string[];
  difficulty: number;
}

export interface MistakeDiagnosis {
  mistake_causes: string[];
  severity: Severity;
  expected_diagnosis: string;
  step_analysis: string[];
  solution_highlights: string[];
  standard_solution: string;
}

export interface DiagnoseImageSuccessResponse {
  diagnosis_id: string;
  student_id: string;
  source: "image";
  steps: AgentStep[];
  recognized_question: ImageRecognizedQuestion;
  knowledge_mapping: KnowledgeMapping;
  mistake_diagnosis: MistakeDiagnosis;
  memory_delta: MemoryDelta;
  student_profile: StudentProfile;
  practice_questions: PracticeQuestion[];
  review_plan: ReviewPlan;
  sample_diagnosis: null;
  fallback_used: false;
  evidence_level: EvidenceLevel;
  persistence_evidence: PersistenceEvidence;
  profile_update_kind: ProfileUpdateKind;
  risk_follow_up: ProblemRiskFollowUp | null;
  warnings: string[];
}
