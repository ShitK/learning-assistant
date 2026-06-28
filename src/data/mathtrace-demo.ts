export type SampleQuestionId =
  | "sample_derivative_001"
  | "sample_function_domain_001"
  | "sample_sequence_recursive_001";

export type PracticeLevel = "basic" | "transfer" | "gaokao_style";
export type Severity = "minor" | "medium" | "severe";

export interface KnowledgePoint {
  id: string;
  display_name: string;
  module: string;
  gaokao_frequency: "low" | "medium" | "high";
}

export interface MistakeCause {
  id: string;
  display_name: string;
  short_name: string;
}

export interface AgentStep {
  id: string;
  display_name: string;
  duration_ms: number;
  summary: string;
}

export interface PracticeQuestion {
  level: PracticeLevel;
  question: string;
  training_goal: string;
}

export interface ReviewPlanDay {
  day: number;
  topic: string;
  task: string;
  estimated_minutes: number;
}

export interface ReviewPlan {
  tomorrow: string;
  seven_days: ReviewPlanDay[];
  rationale: string[];
}

export interface MemoryDelta {
  knowledge_mastery_changes: Record<string, number>;
  mistake_cause_changes: Record<string, number>;
  is_repeated_mistake: boolean;
  review_priority_changes: string[];
  should_persist: boolean;
  rationale: string;
}

export interface SampleDiagnosis {
  id: SampleQuestionId;
  title: string;
  module: string;
  question_text: string;
  student_answer: string;
  standard_solution: string;
  knowledge_points: string[];
  difficulty: number;
  mistake_causes: string[];
  severity: Severity;
  expected_diagnosis: string;
  step_analysis: string[];
  solution_highlights: string[];
  steps: AgentStep[];
  memory_delta: MemoryDelta;
  practice_questions: PracticeQuestion[];
  review_plan: ReviewPlan;
}

export interface StudentProfile {
  student_id: string;
  grade: string;
  subject: "math";
  mastery_scores: Record<string, number>;
  frequent_mistake_causes: Record<string, number>;
  weak_modules: string[];
  review_priority: string[];
  recent_trend: string;
  gaokao_focus: Array<{
    knowledge_point: string;
    reason: string;
    priority: number;
  }>;
  created_at: string;
  updated_at: string;
}

export interface MistakeHistoryItem {
  mistake_id: string;
  created_at: string;
  knowledge_points: string[];
  mistake_causes: string[];
  difficulty: number;
  review_status: 0 | 1 | 2 | 3;
}

export const demoStudentContext = {
  target_exam: "2027 高考数学",
  usage_count: 8,
  today_focus: "导数含参题与分类讨论",
} as const;

export const knowledgePoints: Record<string, KnowledgePoint> = {
  derivative_monotonicity: {
    id: "derivative_monotonicity",
    display_name: "导数与函数单调性",
    module: "derivative",
    gaokao_frequency: "high",
  },
  parameter_classification: {
    id: "parameter_classification",
    display_name: "参数分类讨论",
    module: "derivative",
    gaokao_frequency: "high",
  },
  function_domain: {
    id: "function_domain",
    display_name: "函数定义域",
    module: "function",
    gaokao_frequency: "medium",
  },
  sequence_recursion: {
    id: "sequence_recursion",
    display_name: "数列递推",
    module: "sequence",
    gaokao_frequency: "medium",
  },
  geometric_sequence: {
    id: "geometric_sequence",
    display_name: "等比数列",
    module: "sequence",
    gaokao_frequency: "medium",
  },
};

export const mistakeCauses: Record<string, MistakeCause> = {
  classification_missing: {
    id: "classification_missing",
    display_name: "分类讨论遗漏",
    short_name: "漏分情况",
  },
  domain_missing: {
    id: "domain_missing",
    display_name: "定义域或取值范围遗漏",
    short_name: "范围意识",
  },
  method_error: {
    id: "method_error",
    display_name: "方法选择错误",
    short_name: "方法误判",
  },
  transformation_error: {
    id: "transformation_error",
    display_name: "等价变形错误",
    short_name: "变形失真",
  },
  calculation_error: {
    id: "calculation_error",
    display_name: "计算错误",
    short_name: "计算波动",
  },
};

export const demoStudentProfile: StudentProfile = {
  student_id: "demo_student_001",
  grade: "高二",
  subject: "math",
  mastery_scores: {},
  frequent_mistake_causes: {},
  weak_modules: [],
  review_priority: [],
  recent_trend: "",
  gaokao_focus: [],
  created_at: "2026-03-20T08:00:00+08:00",
  updated_at: "2026-05-28T08:00:00+08:00",
};

export const mistakeHistory: MistakeHistoryItem[] = [
  {
    mistake_id: "m_001",
    created_at: "2026-03-24T20:30:00+08:00",
    knowledge_points: ["function_domain"],
    mistake_causes: ["domain_missing"],
    difficulty: 3,
    review_status: 1,
  },
  {
    mistake_id: "m_002",
    created_at: "2026-04-03T21:10:00+08:00",
    knowledge_points: ["derivative_monotonicity"],
    mistake_causes: ["calculation_error"],
    difficulty: 3,
    review_status: 2,
  },
  {
    mistake_id: "m_003",
    created_at: "2026-04-16T19:40:00+08:00",
    knowledge_points: ["parameter_classification", "derivative_monotonicity"],
    mistake_causes: ["classification_missing"],
    difficulty: 4,
    review_status: 1,
  },
  {
    mistake_id: "m_004",
    created_at: "2026-04-28T20:00:00+08:00",
    knowledge_points: ["sequence_recursion"],
    mistake_causes: ["method_error"],
    difficulty: 3,
    review_status: 0,
  },
  {
    mistake_id: "m_005",
    created_at: "2026-05-06T21:20:00+08:00",
    knowledge_points: ["function_domain", "derivative_monotonicity"],
    mistake_causes: ["domain_missing"],
    difficulty: 4,
    review_status: 1,
  },
  {
    mistake_id: "m_006",
    created_at: "2026-05-14T20:50:00+08:00",
    knowledge_points: ["parameter_classification"],
    mistake_causes: ["classification_missing"],
    difficulty: 4,
    review_status: 0,
  },
  {
    mistake_id: "m_007",
    created_at: "2026-05-22T19:30:00+08:00",
    knowledge_points: ["parameter_classification", "derivative_monotonicity"],
    mistake_causes: ["classification_missing", "domain_missing"],
    difficulty: 4,
    review_status: 0,
  },
];

export const sampleDiagnoses: SampleDiagnosis[] = [
  {
    id: "sample_derivative_001",
    title: "导数与参数分类讨论",
    module: "导数",
    question_text:
      "已知函数 $f(x)=x^3-3ax+1$，讨论 $f(x)$ 在 $R$ 上的单调性。",
    student_answer:
      "$f'(x)=3x^2-3a$。令 $f'(x)=0$ 得 $x=\\sqrt a$，所以 $x<\\sqrt a$ 时递减，$x>\\sqrt a$ 时递增。",
    standard_solution:
      "$f'(x)=3x^2-3a=3(x^2-a)$。当 $a\\le 0$ 时，$x^2-a\\ge 0$，故 $f'(x)\\ge 0$，$f(x)$ 在 $R$ 上单调递增。当 $a>0$ 时，临界点为 $-\\sqrt a$ 和 $\\sqrt a$，函数先增后减再增。",
    knowledge_points: ["derivative_monotonicity", "parameter_classification"],
    difficulty: 4,
    mistake_causes: ["classification_missing", "domain_missing"],
    severity: "medium",
    expected_diagnosis:
      "学生只讨论了 $a>0$ 的部分情况，遗漏 $a\\le 0$；同时临界点只写了 $\\sqrt a$，遗漏 $-\\sqrt a$，导致单调区间判断不完整。",
    step_analysis: ["求导正确", "临界点不完整", "参数分类不完整"],
    solution_highlights: [
      "先看参数符号：$a\\le 0$ 时导数恒非负。",
      "$a>0$ 时有两个临界点 $-\\sqrt a$ 与 $\\sqrt a$。",
      "含参题最后要按参数区间分别写出单调性结论。",
    ],
    steps: buildSteps(
      "命中导数与函数单调性、参数分类讨论。",
      "定位到分类讨论遗漏和定义域意识不足。",
      "参数分类讨论掌握度下降，复习优先级上升。",
    ),
    memory_delta: {
      knowledge_mastery_changes: {
        parameter_classification: -8,
        derivative_monotonicity: -5,
      },
      mistake_cause_changes: {
        classification_missing: 1,
        domain_missing: 1,
      },
      is_repeated_mistake: true,
      review_priority_changes: [
        "parameter_classification",
        "derivative_monotonicity",
      ],
      should_persist: true,
      rationale:
        "P0 样例题使用预标注 delta：参数分类讨论是主要错因且为复发问题，导数单调性为关联知识点。",
    },
    practice_questions: [
      {
        level: "basic",
        question: "已知 $f(x)=x^3-3x$，求 $f(x)$ 的单调区间。",
        training_goal: "巩固利用导数符号判断单调区间。",
      },
      {
        level: "transfer",
        question: "已知 $f(x)=x^3-3ax$，讨论 $a>0$ 时 $f(x)$ 的单调性。",
        training_goal: "训练含参导数题中的临界点完整性。",
      },
      {
        level: "gaokao_style",
        question:
          "已知 $f(x)=x^3-3ax+1$，若 $f(x)$ 在区间 $[1,+\\infty)$ 上单调递增，求实数 $a$ 的取值范围。",
        training_goal: "训练定义域限制、参数范围和导数符号的综合判断。",
      },
    ],
    review_plan: buildReviewPlan("导数临界点", "参数分类讨论"),
  },
  {
    id: "sample_function_domain_001",
    title: "函数定义域与单调性",
    module: "函数",
    question_text:
      "已知函数 $f(x)=\\ln(x-1)-x$，求 $f(x)$ 的定义域，并判断其在定义域内的单调性。",
    student_answer:
      "$f'(x)=\\frac{1}{x-1}-1$，所以 $x<2$ 时递增，$x>2$ 时递减。",
    standard_solution:
      "先确定定义域 $x>1$，再讨论 $f'(x)=\\frac{2-x}{x-1}$。在 $(1,2)$ 上递增，在 $(2,+\\infty)$ 上递减。",
    knowledge_points: ["function_domain", "derivative_monotonicity"],
    difficulty: 3,
    mistake_causes: ["domain_missing"],
    severity: "medium",
    expected_diagnosis:
      "学生进行了导数判断，但没有先写出定义域，导致单调区间表述缺少前提。",
    step_analysis: ["求导方向正确", "定义域缺失", "单调区间端点表达不完整"],
    solution_highlights: [
      "对数函数先写定义域：$x-1>0$。",
      "导数符号判断只能在定义域内进行。",
      "单调区间应写成 $(1,2)$ 与 $(2,+\\infty)$。",
    ],
    steps: buildSteps(
      "命中函数定义域、导数与函数单调性。",
      "定位到定义域遗漏。",
      "函数定义域复习优先级上升。",
    ),
    memory_delta: {
      knowledge_mastery_changes: {
        function_domain: -7,
        derivative_monotonicity: -3,
      },
      mistake_cause_changes: {
        domain_missing: 1,
      },
      is_repeated_mistake: true,
      review_priority_changes: ["function_domain", "derivative_monotonicity"],
      should_persist: true,
      rationale:
        "定义域遗漏在 mock 历史中重复出现，且会影响函数、导数和不等式多个模块。",
    },
    practice_questions: [
      {
        level: "basic",
        question: "求函数 $f(x)=\\ln x-x$ 的定义域和单调区间。",
        training_goal: "巩固定义域优先意识。",
      },
      {
        level: "transfer",
        question: "已知 $f(x)=\\ln(x-a)-x$，求定义域并讨论单调性。",
        training_goal: "训练含参定义域。",
      },
      {
        level: "gaokao_style",
        question:
          "若 $f(x)=\\ln(x-1)-ax$ 在 $(1,+\\infty)$ 上单调递减，求 $a$ 的范围。",
        training_goal: "训练定义域、导数符号与参数范围综合判断。",
      },
    ],
    review_plan: buildReviewPlan("定义域优先", "函数单调性"),
  },
  {
    id: "sample_sequence_recursive_001",
    title: "数列递推与通项",
    module: "数列",
    question_text:
      "已知数列 $a_1=1$，$a_{n+1}=2a_n+1$，求 $a_n$ 的通项公式。",
    student_answer:
      "因为 $a_{n+1}-a_n=a_n+1$，所以是等差数列，$a_n=n$。",
    standard_solution:
      "由 $a_{n+1}+1=2(a_n+1)$，可知 $a_n+1$ 是首项为 2、公比为 2 的等比数列，所以 $a_n=2^n-1$。",
    knowledge_points: ["sequence_recursion", "geometric_sequence"],
    difficulty: 3,
    mistake_causes: ["method_error", "transformation_error"],
    severity: "medium",
    expected_diagnosis:
      "学生误把递推关系当作等差关系，没有识别构造 $a_n+1$ 的等比数列方法。",
    step_analysis: ["递推式识别不足", "等差判断不成立", "缺少辅助数列构造"],
    solution_highlights: [
      "先观察常数项，尝试把递推式改写成 $a_{n+1}+1=2(a_n+1)$。",
      "$a_n+1$ 构成等比数列，首项为 2，公比为 2。",
      "最后回代得到 $a_n=2^n-1$。",
    ],
    steps: buildSteps(
      "命中数列递推、等比数列。",
      "定位到方法选择错误和等价变形错误。",
      "数列递推加入近期复习队列。",
    ),
    memory_delta: {
      knowledge_mastery_changes: {
        sequence_recursion: -6,
        geometric_sequence: -4,
      },
      mistake_cause_changes: {
        method_error: 1,
        transformation_error: 1,
      },
      is_repeated_mistake: false,
      review_priority_changes: ["sequence_recursion"],
      should_persist: true,
      rationale:
        "本题暴露递推结构识别问题，但 mock 历史中还没有同知识点同错因的复发记录。",
    },
    practice_questions: [
      {
        level: "basic",
        question: "已知 $b_{n+1}=2b_n$，$b_1=2$，求 $b_n$。",
        training_goal: "巩固等比数列通项。",
      },
      {
        level: "transfer",
        question: "已知 $a_1=2$，$a_{n+1}=3a_n+2$，求 $a_n$。",
        training_goal: "训练构造辅助数列。",
      },
      {
        level: "gaokao_style",
        question:
          "已知 $a_{n+1}=2a_n+1$，$a_1=1$，求 $S_n=a_1+a_2+...+a_n$。",
        training_goal: "训练递推通项与求和综合。",
      },
    ],
    review_plan: buildReviewPlan("递推结构识别", "辅助数列构造"),
  },
];

function buildSteps(
  knowledgeSummary: string,
  mistakeSummary: string,
  memorySummary: string,
): AgentStep[] {
  return [
    {
      id: "extraction",
      display_name: "识别题目",
      duration_ms: 300,
      summary: "已读取预标注样例题。",
    },
    {
      id: "knowledge_mapping",
      display_name: "匹配知识点",
      duration_ms: 200,
      summary: knowledgeSummary,
    },
    {
      id: "mistake_diagnosis",
      display_name: "分析错因",
      duration_ms: 400,
      summary: mistakeSummary,
    },
    {
      id: "memory_update",
      display_name: "更新画像",
      duration_ms: 200,
      summary: memorySummary,
    },
    {
      id: "practice_generation",
      display_name: "生成练习",
      duration_ms: 200,
      summary: "已生成基础、迁移和高考综合三类变式题。",
    },
    {
      id: "review_planning",
      display_name: "规划复习",
      duration_ms: 200,
      summary: "已生成轻量 7 天复习建议。",
    },
  ];
}

function buildReviewPlan(firstTopic: string, secondTopic: string): ReviewPlan {
  return {
    tomorrow: `复习${firstTopic}，重做本题并补全关键步骤。`,
    seven_days: [
      {
        day: 1,
        topic: firstTopic,
        task: "重做本题，标出错误发生的第一步。",
        estimated_minutes: 20,
      },
      {
        day: 2,
        topic: secondTopic,
        task: "整理同类题的检查清单。",
        estimated_minutes: 25,
      },
      {
        day: 3,
        topic: "关联薄弱点",
        task: "完成 2 道带限制条件的迁移题。",
        estimated_minutes: 20,
      },
      {
        day: 4,
        topic: "同类迁移",
        task: "完成一组同题型变式训练。",
        estimated_minutes: 25,
      },
      {
        day: 5,
        topic: "高考综合",
        task: "完成 1 道高考风格综合题。",
        estimated_minutes: 30,
      },
      {
        day: 6,
        topic: "旧错回看",
        task: "回看最近 90 天内相同错因的历史题。",
        estimated_minutes: 20,
      },
      {
        day: 7,
        topic: "复盘总结",
        task: "写下下一次做题前必须检查的 3 个条件。",
        estimated_minutes: 15,
      },
    ],
    rationale: [
      "本次诊断暴露的错因已写入 memory_delta。",
      "复习顺序优先处理掌握度低、复发频率高的知识点。",
      "最后两天安排旧错回看和检查清单，降低同类错误复发概率。",
    ],
  };
}
