export type ExtractionConfidence = "high" | "medium" | "low";

export interface VisionExtractionDraft {
  question_text: string;
  student_answer: string;
  student_solution_steps: string[];
  standard_solution_draft: string;
  extraction_confidence: ExtractionConfidence;
  warnings: string[];
}

export interface VisionExtractionDebugSummary {
  output_kind: "json_object" | "json_parse_error" | "non_object";
  raw_output_length: number;
  present_fields: string[];
  missing_fields: string[];
  extra_fields: string[];
  forbidden_fields: string[];
  field_lengths: {
    question_text?: number;
    student_answer?: number;
    standard_solution_draft?: number;
  };
  list_lengths: {
    student_solution_steps?: number;
    warnings?: number;
  };
}
