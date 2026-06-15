import type { ReactElement } from "react";
import type {
  FollowUpAnswerDraft,
  ProblemRiskFollowUp,
} from "@/lib/diagnosis/diagnose-api";
import type { EditableExtractionDraft } from "@/lib/diagnosis/diagnosis-view-model";

export function RiskFollowUpPanel({
  followUp,
  selectedChoiceId,
  customText,
  pendingFollowUpAnswer,
  isDisabled,
  onSelectChoice,
  onUpdateCustomText,
  onSkip,
  onSubmit,
  onConfirm,
}: {
  followUp: ProblemRiskFollowUp;
  selectedChoiceId: string | null;
  customText: string;
  pendingFollowUpAnswer: FollowUpAnswerDraft | null;
  isDisabled: boolean;
  onSelectChoice: (choiceId: string) => void;
  onUpdateCustomText: (text: string) => void;
  onSkip: () => void;
  onSubmit: () => void;
  onConfirm: () => void;
}): ReactElement {
  const isCustomSelected = selectedChoiceId === "custom";
  const hasPendingFollowUpAnswer = pendingFollowUpAnswer !== null;
  const canSubmit =
    !isDisabled &&
    selectedChoiceId !== null &&
    (!isCustomSelected || customText.trim().length > 0);
  const canUsePrimaryAction = hasPendingFollowUpAnswer ? !isDisabled : canSubmit;

  return (
    <div className="mt-4 rounded-[16px] border border-[var(--mocha-light)] bg-white p-4">
      <p className="text-sm font-semibold text-[var(--charcoal)]">
        学生步骤不清，暂不能直接判断具体错因。
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--warm-gray)]">
        本题题型：{followUp.problem_type}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {followUp.common_stuck_points.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={isDisabled}
            onClick={() => onSelectChoice(item.id)}
            className={`min-h-9 rounded-full border px-3 text-sm font-medium ${
              selectedChoiceId === item.id
                ? "border-[var(--mocha)] bg-[var(--mocha-muted)] text-[var(--mocha)]"
                : "border-[var(--light-gray)] bg-[var(--oat)] text-[var(--warm-gray)]"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => onSelectChoice("custom")}
          className={`min-h-9 rounded-full border px-3 text-sm font-medium ${
            isCustomSelected
              ? "border-[var(--mocha)] bg-[var(--mocha-muted)] text-[var(--mocha)]"
              : "border-[var(--light-gray)] bg-[var(--oat)] text-[var(--warm-gray)]"
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          我自己说
        </button>
      </div>

      {isCustomSelected ? (
        <textarea
          value={customText}
          rows={2}
          disabled={isDisabled}
          onChange={(event) => onUpdateCustomText(event.target.value)}
          placeholder="用一句话说说你卡在哪里"
          className="mt-3 min-h-16 w-full resize-y rounded-[14px] border border-[var(--light-gray)] bg-[var(--oat)] px-3 py-2 text-sm leading-6 text-[var(--charcoal)] outline-none focus:border-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
        />
      ) : null}

      <p className="mt-3 text-xs leading-5 text-[var(--warm-gray)]">
        跳过后只轻微下调相关考点掌握度并记录复习关注，不记录具体错因。
      </p>

      {pendingFollowUpAnswer ? (
        <p className="mt-3 rounded-[14px] bg-[var(--amber-bg)] px-3 py-2 text-sm leading-6 text-[var(--amber-text)]">
          已生成分析草稿，请核对下方草稿后确认写入画像。
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          disabled={isDisabled}
          onClick={onSkip}
          className="min-h-10 rounded-full border border-[var(--light-gray)] bg-white px-4 text-sm font-semibold text-[var(--warm-gray)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          跳过，只记复习关注
        </button>
        <button
          type="button"
          disabled={!canUsePrimaryAction}
          onClick={hasPendingFollowUpAnswer ? onConfirm : onSubmit}
          className={`min-h-10 rounded-full px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${
            hasPendingFollowUpAnswer
              ? "bg-[var(--deep-green)]"
              : "bg-[var(--mocha)]"
          }`}
        >
          {pendingFollowUpAnswer ? "确认写入画像" : "生成分析草稿"}
        </button>
      </div>
    </div>
  );
}

export function createEditableDraftRiskFollowUp(
  draft: EditableExtractionDraft,
): ProblemRiskFollowUp | null {
  const questionText = draft.question_text.trim();
  const hasRecognizedStudentAnswer =
    draft.student_answer.trim().length > 0 &&
    !isUnrecognizedStudentAnswer(draft.student_answer);
  const hasStudentSteps = draft.steps_text.trim().length > 0;

  if (
    questionText.length === 0 ||
    (hasRecognizedStudentAnswer &&
      hasStudentSteps &&
      draft.extraction_confidence !== "low")
  ) {
    return null;
  }

  const text = questionText;
  const knowledgeIds = inferDraftKnowledgeIds(text);

  return {
    problem_type: inferDraftProblemType(text),
    knowledge_points: knowledgeIds,
    common_stuck_points: [
      {
        id: "calculation_error",
        label: "求导",
        related_mistake_cause: "calculation_error",
      },
      {
        id: "classification_missing",
        label: "分类讨论",
        related_mistake_cause: "classification_missing",
      },
      {
        id: "domain_missing",
        label: "端点条件",
        related_mistake_cause: "domain_missing",
      },
      {
        id: "method_error",
        label: "参数范围",
        related_mistake_cause: "method_error",
      },
    ],
    standard_solution_summary: "标准解法将在确认后由文本分析模型或本地规则生成。",
    prompt: "你主要卡在哪里？",
  };
}

function inferDraftKnowledgeIds(text: string): string[] {
  const knowledgeIds: string[] = [];

  if (/导数|f'|单调/.test(text)) {
    knowledgeIds.push("derivative_monotonicity");
  }

  if (/参数|讨论|取值范围|a\\le|a>/.test(text)) {
    knowledgeIds.push("parameter_classification");
  }

  if (/定义域|ln|log/.test(text)) {
    knowledgeIds.push("function_domain");
  }

  return knowledgeIds.length > 0 ? knowledgeIds : ["derivative_monotonicity"];
}

function inferDraftProblemType(text: string): string {
  if (/导数/.test(text) && /参数|讨论|取值范围/.test(text)) {
    return "导数中的极值点与参数范围";
  }

  if (/导数|单调/.test(text)) {
    return "导数与函数单调性";
  }

  return "数学综合题";
}

function isUnrecognizedStudentAnswer(value: string): boolean {
  return /(未识别到|未找到|无法识别|没有识别到|没有检测到).*学生.*(答案|作答)/.test(
    value,
  );
}
