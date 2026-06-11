import type { ReactElement } from "react";
import { MathText } from "@/components/math-text";
import type {
  MistakeBookItemSummary,
  MistakeBookResponse,
} from "@/lib/mistake-book-client";
import { normalizeExtractedMathText } from "@/lib/math-extraction-normalizer";

type MistakeBookPanelStatus = "loading" | "ready" | "error";

interface MistakeBookPanelProps {
  status: MistakeBookPanelStatus;
  response: MistakeBookResponse | null;
  errorMessage: string | null;
}

interface MistakeBookPanelViewModel {
  statusLabel: string;
  description: string;
  warnings: string[];
  items: MistakeBookPanelItemViewModel[];
}

interface MistakeBookPanelItemViewModel {
  id: string;
  questionText: string;
  sourceLabel: string;
  severityLabel: string;
  knowledgeLabel: string;
  mistakeCauseLabel: string;
  summary: string;
  evidenceLabel: string;
  reviewStatusLabel: string;
  createdAtLabel: string;
}

const severityLabels: Record<MistakeBookItemSummary["severity"], string> = {
  minor: "轻微",
  medium: "中等",
  severe: "严重",
};

const sourceLabels: Record<MistakeBookItemSummary["source"], string> = {
  sample: "样例诊断",
  image: "图片诊断",
};

const evidenceLabels: Record<string, string> = {
  student_work: "学生步骤",
  user_confirmed: "用户确认",
  uploaded_problem_only: "仅题型关注",
  none: "未写入",
};

const reviewStatusLabels: Record<MistakeBookItemSummary["review_status"], string> =
  {
    0: "未复习",
    1: "复习中",
    2: "已掌握",
    3: "暂缓",
  };

export function MistakeBookPanel({
  status,
  response,
  errorMessage,
}: MistakeBookPanelProps): ReactElement {
  const viewModel = createMistakeBookPanelViewModel({
    status,
    response,
    errorMessage,
  });

  return (
    <section className="mathtrace-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--oat)] p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--mocha)]">
            Mistake book
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-normal text-[var(--charcoal)]">
            最近错题
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--warm-gray)]">
            {viewModel.description}
          </p>
        </div>
        <span className="w-fit rounded-full bg-[var(--oat)] px-3 py-1 text-xs font-medium text-[var(--warm-gray)]">
          {viewModel.statusLabel}
        </span>
      </div>

      <div className="grid gap-3 p-5 sm:p-6">
        {viewModel.warnings.map((warning) => (
          <p
            key={warning}
            className="rounded-[16px] bg-[var(--amber-bg)] px-4 py-3 text-sm leading-6 text-[var(--amber-text)]"
          >
            {warning}
          </p>
        ))}

        {viewModel.items.length === 0 ? (
          <div className="rounded-[20px] bg-[var(--oat)] p-5">
            <p className="text-sm font-semibold text-[var(--charcoal)]">
              {viewModel.statusLabel}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--warm-gray)]">
              {viewModel.description}
            </p>
          </div>
        ) : (
          viewModel.items.map((item) => (
            <article
              key={item.id}
              className="rounded-[20px] border border-[var(--oat)] bg-white p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[var(--deep-green-muted)] px-3 py-1 text-xs font-semibold text-[var(--deep-green)]">
                  {item.sourceLabel}
                </span>
                <span className="rounded-full bg-[var(--amber-bg)] px-3 py-1 text-xs font-semibold text-[var(--amber-text)]">
                  {item.severityLabel}
                </span>
                <span className="ml-auto text-xs text-[var(--warm-gray)]">
                  {item.createdAtLabel}
                </span>
              </div>

              <h3 className="mt-3 text-base font-semibold leading-6 text-[var(--charcoal)]">
                <MathText text={item.questionText} />
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--warm-gray)]">
                <MathText text={item.summary} />
              </p>

              <div className="mt-4 grid gap-2 text-xs leading-5 text-[var(--warm-gray)] sm:grid-cols-2">
                <p>考点：{item.knowledgeLabel}</p>
                <p>错因：{item.mistakeCauseLabel}</p>
                <p>证据：{item.evidenceLabel}</p>
                <p>复习状态：{item.reviewStatusLabel}</p>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export function createMistakeBookPanelViewModel(input: {
  status: MistakeBookPanelStatus;
  response: MistakeBookResponse | null;
  errorMessage: string | null;
}): MistakeBookPanelViewModel {
  if (input.status === "loading") {
    return {
      statusLabel: "读取中",
      description: "正在读取最近错题。",
      warnings: [],
      items: [],
    };
  }

  if (input.status === "error") {
    return {
      statusLabel: "读取失败",
      description: input.errorMessage ?? "错题本暂时读取失败。",
      warnings: [],
      items: [],
    };
  }

  if (!input.response || input.response.items.length === 0) {
    return {
      statusLabel: getEmptyStatusLabel(input.response),
      description: getEmptyDescription(input.response),
      warnings: input.response?.warnings ?? [],
      items: [],
    };
  }

  return {
    statusLabel: `最近 ${input.response.items.length} 条`,
    description: "按创建时间倒序展示最近写入的诊断记录。",
    warnings: input.response.warnings,
    items: input.response.items.map(toItemViewModel),
  };
}

function toItemViewModel(
  item: MistakeBookItemSummary,
): MistakeBookPanelItemViewModel {
  return {
    id: item.id,
    questionText: truncateText(normalizeExtractedMathText(item.question_text), 56),
    sourceLabel: sourceLabels[item.source],
    severityLabel: severityLabels[item.severity],
    knowledgeLabel: joinOrFallback(item.knowledge_points),
    mistakeCauseLabel: joinOrFallback(item.mistake_causes),
    summary: truncateText(normalizeExtractedMathText(item.diagnosis_summary), 72),
    evidenceLabel: getEvidenceLabel(item.persistence_evidence),
    reviewStatusLabel: reviewStatusLabels[item.review_status],
    createdAtLabel: item.created_at.slice(0, 10),
  };
}

function getEmptyStatusLabel(response: MistakeBookResponse | null): string {
  if (response && !response.is_database_configured) {
    return "数据库未配置";
  }

  return "暂无错题记录";
}

function getEmptyDescription(response: MistakeBookResponse | null): string {
  if (response && !response.is_database_configured) {
    return "配置 Supabase 后会显示最近写入的错题。";
  }

  return "完成一次可写入画像的诊断后，这里会显示最近错题。";
}

function getEvidenceLabel(
  evidence: MistakeBookItemSummary["persistence_evidence"],
): string {
  if (evidence === null) {
    return "未记录";
  }

  return evidenceLabels[evidence] ?? evidence;
}

function joinOrFallback(values: string[]): string {
  return values.length > 0 ? values.join("、") : "暂无";
}

function truncateText(text: string, maxLength: number): string {
  const normalizedText = text.trim();
  if (normalizedText.length <= maxLength) {
    return normalizedText;
  }

  const slicedText = normalizedText.slice(0, maxLength).trimEnd();
  if (!hasBalancedInlineMathDelimiters(slicedText)) {
    const lastDelimiterIndex = findLastInlineMathDelimiterIndex(slicedText);
    if (lastDelimiterIndex > 0) {
      return `${slicedText.slice(0, lastDelimiterIndex).trimEnd()}...`;
    }
  }

  return `${slicedText}...`;
}

function hasBalancedInlineMathDelimiters(text: string): boolean {
  return findInlineMathDelimiterIndexes(text).length % 2 === 0;
}

function findLastInlineMathDelimiterIndex(text: string): number {
  const indexes = findInlineMathDelimiterIndexes(text);
  return indexes[indexes.length - 1] ?? -1;
}

function findInlineMathDelimiterIndexes(text: string): number[] {
  const indexes: number[] = [];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "$" && text[index - 1] !== "\\") {
      indexes.push(index);
    }
  }

  return indexes;
}
