import type { ReactElement } from "react";
import { MathText } from "@/components/math-text";
import type { DiagnosisViewModel } from "@/lib/diagnosis/diagnosis-view-model";
import type {
  ProductVariantPractice,
  ProductVariantPracticeItem,
} from "@/lib/rag/variant-practice-product-view-model";
import {
  practiceLevelLabels,
  variantPracticeTypeLabels,
} from "@/components/workbench/workbench-labels";
import { SectionHeader } from "@/components/workbench/section-header";
import { Tag } from "@/components/workbench/tag";

type PracticeDisplayItem = {
  key: string;
  index: number;
  title: string;
  question: string;
  trainingGoal: string;
  tone: "green" | "rust";
};

export function PracticeLab({
  diagnosis,
  variantPractice = null,
}: {
  diagnosis: DiagnosisViewModel;
  variantPractice?: ProductVariantPractice | null;
}): ReactElement {
  const displayItems: PracticeDisplayItem[] = variantPractice
    ? variantPractice.items.map(createRagPracticeDisplayItem)
    : diagnosis.practice_questions.map((practice, index) => ({
        key: `${practice.level}-${practice.question}`,
        index,
        title: practiceLevelLabels[practice.level],
        question: practice.question,
        trainingGoal: practice.training_goal,
        tone: practice.level === "gaokao_style" ? "rust" : "green",
      }));

  return (
    <section className="mathtrace-card mt-8 overflow-hidden text-[var(--charcoal)]">
      <div className="border-b border-[var(--oat)] p-5 sm:p-6">
        <SectionHeader
          kicker="Practice lab"
          title="变式练习"
          description={
            variantPractice
              ? "根据当前错因从本地教辅题库中推荐练习题；正式展示隐藏内部标签和检索分数。"
              : "P0 使用预写题目；后续可在这里上传作答，继续分析新的答题情况。"
          }
        />
      </div>

      <div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-3">
        {displayItems.map((practice) => (
          <article
            key={practice.key}
            className="flex min-h-[260px] flex-col rounded-[20px] border border-[var(--oat)] bg-white p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--mocha)]">
                  {String(practice.index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-2 text-xl font-semibold">{practice.title}</h3>
              </div>
              <Tag tone={practice.tone}>不做真实批改</Tag>
            </div>

            <p className="mt-5 text-sm leading-7 text-[var(--charcoal)]">
              <MathText text={practice.question} />
            </p>
            <p className="mt-4 text-sm leading-6 text-[var(--warm-gray)]">
              {practice.trainingGoal}
            </p>
            <button
              type="button"
              disabled
              className="mt-auto min-h-10 rounded-full border border-dashed border-[var(--light-gray)] bg-[var(--oat)] px-4 text-sm font-medium text-[var(--warm-gray)] disabled:cursor-not-allowed"
            >
              上传作答继续诊断 · P1
            </button>
          </article>
        ))}
      </div>
      {variantPractice?.notice ? (
        <p className="border-t border-[var(--oat)] px-5 pb-5 text-sm leading-6 text-[var(--warm-gray)] sm:px-6">
          {variantPractice.notice}
        </p>
      ) : null}
    </section>
  );
}

function createRagPracticeDisplayItem(
  item: ProductVariantPracticeItem,
  index: number,
): PracticeDisplayItem {
  return {
    key: `${item.type}-${item.rank}`,
    index,
    title: variantPracticeTypeLabels[item.type],
    question: item.question_text,
    trainingGoal: item.reason,
    tone:
      item.type === "mixed_application" || item.type === "additional_practice"
        ? "rust"
        : "green",
  };
}
