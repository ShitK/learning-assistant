import type { ReactElement } from "react";
import { MathText } from "@/components/math-text";
import type { DiagnosisViewModel } from "@/lib/diagnosis/diagnosis-view-model";
import { practiceLevelLabels } from "@/components/workbench/workbench-labels";
import { SectionHeader } from "@/components/workbench/section-header";
import { Tag } from "@/components/workbench/tag";

export function PracticeLab({
  diagnosis,
}: {
  diagnosis: DiagnosisViewModel;
}): ReactElement {
  return (
    <section className="mathtrace-card mt-8 overflow-hidden text-[var(--charcoal)]">
      <div className="border-b border-[var(--oat)] p-5 sm:p-6">
        <SectionHeader
          kicker="Practice lab"
          title="变式练习"
          description="P0 使用预写题目；后续可在这里上传作答，继续分析新的答题情况。"
        />
      </div>

      <div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-3">
        {diagnosis.practice_questions.map((practice, index) => (
          <article
            key={`${practice.level}-${practice.question}`}
            className="flex min-h-[260px] flex-col rounded-[20px] border border-[var(--oat)] bg-white p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--mocha)]">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-2 text-xl font-semibold">
                  {practiceLevelLabels[practice.level]}
                </h3>
              </div>
              <Tag tone={practice.level === "gaokao_style" ? "rust" : "green"}>
                不做真实批改
              </Tag>
            </div>

            <p className="mt-5 text-sm leading-7 text-[var(--charcoal)]">
              <MathText text={practice.question} />
            </p>
            <p className="mt-4 text-sm leading-6 text-[var(--warm-gray)]">
              {practice.training_goal}
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
    </section>
  );
}
