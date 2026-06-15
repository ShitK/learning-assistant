import type { StudentProfile } from "@/data/mathtrace-demo";
import type {
  ConfirmationAction,
  FollowUpAnswerDraft,
} from "@/lib/diagnosis/diagnose-api";

export type DiagnosisMode = "sample" | "image";

export interface ProfilePreview {
  beforeProfile: StudentProfile;
  afterProfile: StudentProfile | null;
}

export interface ConfirmedDiagnosisOptions {
  confirmation_action?: ConfirmationAction;
  follow_up_answer?: FollowUpAnswerDraft;
}
