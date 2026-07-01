const forbiddenInternalFields = [
  "retrieval_source",
  "score",
  "item_id",
  "source_ref",
  "cosine_distance",
  "embedding_hash",
];

export const variantPracticeEvalCases = [
  {
    id: "sample_derivative_parameter_classification",
    title: "参数分类讨论诊断摘要",
    request: {
      student_id: "demo_student_001",
      request_source: "confirmed_image_diagnosis",
      evidence_level: "student_work_sufficient",
      persistence_evidence: "student_work",
      profile_update_kind: "mistake_cause",
      question_text:
        "已知函数 f(x)=x^3-3ax 在区间上恒成立相关问题，学生分类讨论参数范围时遗漏边界。",
      knowledge_points: ["parameter_classification"],
      mistake_causes: ["classification_missing", "boundary_omission"],
    },
    expected: {
      min_items: 3,
      required_target_skills: ["parameter_range"],
      preferred_method_tags: ["parameter_range"],
      forbidden_internal_fields: forbiddenInternalFields,
    },
  },
  {
    id: "upload_derivative_monotonicity",
    title: "导数与单调性上传题",
    request: {
      student_id: "demo_student_001",
      request_source: "confirmed_image_diagnosis",
      evidence_level: "student_work_sufficient",
      persistence_evidence: "student_work",
      profile_update_kind: "mistake_cause",
      question_text:
        "已知函数 f(x)=ln x-ax，讨论函数单调区间，学生没有完整分析导数符号和参数边界。",
      knowledge_points: ["derivative_monotonicity"],
      mistake_causes: ["range_boundary_omission"],
    },
    expected: {
      min_items: 3,
      required_target_skills: ["monotonicity"],
      preferred_method_tags: ["monotonicity", "parameter_range"],
      forbidden_internal_fields: forbiddenInternalFields,
    },
  },
  {
    id: "upload_tangent_slope",
    title: "切线斜率上传题",
    request: {
      student_id: "demo_student_001",
      request_source: "confirmed_image_diagnosis",
      evidence_level: "student_work_sufficient",
      persistence_evidence: "student_work",
      profile_update_kind: "mistake_cause",
      // 使用 derivative_monotonicity 作为导数入口，题干中的“切线斜率”文本触发 tangent_slope / derivative_geometric_meaning。
      question_text: "已知曲线 y=f(x) 在 x=1 处的切线斜率，求切线方程。",
      knowledge_points: ["derivative_monotonicity"],
      mistake_causes: ["formula_misuse"],
    },
    expected: {
      min_items: 3,
      required_target_skills: ["tangent_slope", "derivative_geometric_meaning"],
      preferred_method_tags: ["tangent_slope", "derivative_geometric_meaning"],
      forbidden_internal_fields: forbiddenInternalFields,
    },
  },
  {
    id: "upload_extrema_or_maximum",
    title: "极值与最值上传题",
    request: {
      student_id: "demo_student_001",
      request_source: "confirmed_image_diagnosis",
      evidence_level: "student_work_sufficient",
      persistence_evidence: "student_work",
      profile_update_kind: "mistake_cause",
      // 使用 derivative_monotonicity 作为导数入口，题干中的“极值与最值”文本触发 extrema target skill。
      question_text: "已知函数 f(x)=x^3-3x，讨论函数单调性并求函数的极值与最值。",
      knowledge_points: ["derivative_monotonicity"],
      mistake_causes: ["critical_point_missing"],
    },
    expected: {
      min_items: 3,
      required_target_skills: ["extrema"],
      preferred_method_tags: ["extrema"],
      forbidden_internal_fields: forbiddenInternalFields,
    },
  },
  {
    id: "upload_problem_only_low_evidence",
    title: "只有题干的低证据导数题",
    request: {
      student_id: "demo_student_001",
      request_source: "confirmed_image_diagnosis",
      evidence_level: "problem_only",
      persistence_evidence: "uploaded_problem_only",
      profile_update_kind: "problem_type_focus",
      question_text: "已知函数 f(x)=x^3-3x，求函数的极值与单调区间。",
      knowledge_points: ["derivative_monotonicity"],
      mistake_causes: [],
    },
    expected: {
      min_items: 3,
      required_target_skills: ["monotonicity", "extrema"],
      preferred_method_tags: ["monotonicity", "extrema"],
      forbidden_internal_fields: forbiddenInternalFields,
    },
  },
  {
    id: "unsupported_non_derivative",
    title: "非导数题不进入导数 RAG",
    request: {
      student_id: "demo_student_001",
      request_source: "confirmed_image_diagnosis",
      evidence_level: "student_work_sufficient",
      persistence_evidence: "student_work",
      profile_update_kind: "mistake_cause",
      question_text: "已知数列 an 满足递推关系，求通项公式。",
      knowledge_points: ["sequence_recursion"],
      mistake_causes: ["formula_misuse"],
    },
    expected: {
      min_items: 0,
      required_target_skills: [],
      preferred_method_tags: [],
      forbidden_internal_fields: forbiddenInternalFields,
    },
  },
];
