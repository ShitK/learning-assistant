export type DiagnoseErrorCode =
  | "invalid_json"
  | "invalid_request"
  | "missing_sample_question_id"
  | "unknown_sample_question_id"
  | "missing_image"
  | "invalid_image"
  | "image_too_large"
  | "model_not_configured"
  | "model_timeout"
  | "model_request_failed"
  | "model_invalid_output";
