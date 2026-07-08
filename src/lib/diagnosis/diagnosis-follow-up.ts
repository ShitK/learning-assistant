import type { DiagnosisViewModel } from "@/lib/diagnosis/diagnosis-view-model";

export interface CreateLocalDiagnosisFollowUpAnswerInput {
  question: string;
  diagnosis: DiagnosisViewModel;
}

export function canSubmitProblemFollowUp(
  text: string,
  diagnosis: DiagnosisViewModel,
): boolean {
  return text.trim().length > 0 && diagnosis.standard_solution.trim().length > 0;
}

export function createLocalDiagnosisFollowUpAnswer(
  input: CreateLocalDiagnosisFollowUpAnswerInput,
): string {
  const question = input.question.trim();
  const diagnosis = input.diagnosis;
  const firstHighlight =
    diagnosis.solution_highlights[0] ?? "先把题干条件整理清楚";
  const firstStep = diagnosis.step_analysis[0] ?? diagnosis.expected_diagnosis;

  if (/第\s*\d+\s*步|第\w+步|这一步|没看懂|不太理解/.test(question)) {
    const requestedStep = question.match(/第\s*(\d+)\s*步/)?.[1] ?? null;
    const secondHighlight = diagnosis.solution_highlights[1] ?? firstHighlight;
    const stepPrefix = requestedStep
      ? `第 ${requestedStep} 步可以这样看：`
      : "这一步可以这样看：";
    return `${stepPrefix}先看关键判断点：${secondHighlight}。这类题不要急着套结论，先把题干条件和每一步变形依据对齐，再回到右侧标准解法逐行核对。`;
  }

  if (/分类讨论|参数|情况/.test(question)) {
    return `这里强调分类讨论，是因为本题的结论会随条件变化。右侧标准解法里的关键判断点是：${firstHighlight}。如果直接合并情况，就容易漏掉边界或参数范围。`;
  }

  if (/避免|下次|怎么改|怎么练/.test(question)) {
    return `下次遇到同类题，可以先做三步检查：第一，圈出题干条件；第二，写出关键判断点；第三，对照本次错因“${diagnosis.expected_diagnosis}”检查有没有漏条件。`;
  }

  return `我先用本题报告里的信息解释：${firstStep}。更完整的正确过程在右侧标准解法里，建议你先对照关键判断点“${firstHighlight}”看一遍。`;
}
