export type ConfirmationAction =
  | "diagnose_from_student_work"
  | "skip_follow_up"
  | "submit_stuck_point"
  | "confirm_stuck_point_analysis";

export interface FollowUpAnswerDraft {
  selected_stuck_point_id: string | null;
  custom_text: string | null;
}

export type FollowUpAnswerParseResult =
  | { ok: true; value: FollowUpAnswerDraft }
  | { ok: false; message: string };
