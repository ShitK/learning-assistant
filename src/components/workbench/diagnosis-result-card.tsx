import type { ReactElement } from "react";
import { MathText } from "@/components/math-text";
import { SectionHeader } from "@/components/workbench/section-header";
import { StandardSolutionContent } from "@/components/workbench/standard-solution-content";
import { Tag } from "@/components/workbench/tag";
import {
  getKnowledgeName,
  severityLabels,
} from "@/components/workbench/workbench-labels";
import {
  createDiagnosisResultVisibility,
  createStandardSolutionBlocks,
} from "@/lib/diagnosis/diagnosis-view-model";
import type { DiagnosisViewModel } from "@/lib/diagnosis/diagnosis-view-model";

export function DiagnosisResultCard({
  diagnosis,
  retainedReportNotice,
  isCurrentConfirmedImageReport,
}: {
  diagnosis: DiagnosisViewModel;
  retainedReportNotice: string | null;
  isCurrentConfirmedImageReport: boolean;
}): ReactElement {
  const visibility = createDiagnosisResultVisibility({
    source: diagnosis.source,
    isCurrentConfirmedImageReport,
  });
  const standardSolutionBlocks = createStandardSolutionBlocks(
    diagnosis.standard_solution,
  );

  return (
    <section className="mathtrace-card flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--oat)] p-5 sm:p-6">
        <SectionHeader
          kicker="Diagnosis result"
          title="标准解法与错因"
          description="先看正确解题路径，再对照关键步骤检查解题过程。"
        />
      </div>

      <div className="flex flex-1 flex-col gap-5 p-5 sm:p-6">
        {retainedReportNotice ? (
          <p className="rounded-[16px] bg-[var(--amber-bg)] px-4 py-3 text-sm leading-6 text-[var(--amber-text)]">
            {retainedReportNotice}
          </p>
        ) : null}

        {diagnosis.warnings.length > 0 ? (
          <div className="grid gap-2">
            {diagnosis.warnings.map((warning) => (
              <p
                key={warning}
                className="rounded-[16px] bg-[var(--amber-bg)] px-4 py-3 text-sm leading-6 text-[var(--amber-text)]"
              >
                {warning}
              </p>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {diagnosis.knowledge_points.map((id) => (
            <Tag key={id} tone="green">
              {getKnowledgeName(id)}
            </Tag>
          ))}
          <Tag tone="amber">严重度：{severityLabels[diagnosis.severity]}</Tag>
        </div>

        {diagnosis.source === "image" && visibility.show_image_recognition ? (
          <div className="rounded-[20px] border border-[var(--oat)] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--charcoal)]">
                模型识别结果
              </p>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-[16px] bg-[var(--oat)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--mocha)]">
                  recognized question
                </p>
                <p className="mt-3 text-sm leading-7 text-[var(--charcoal)]">
                  <MathText text={diagnosis.question_text} />
                </p>
              </div>
              <div className="rounded-[16px] bg-[var(--oat)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--mocha)]">
                  recognized steps
                </p>
                <div className="mt-3 grid gap-2">
                  {diagnosis.student_solution_steps.map((step, index) => (
                    <p
                      key={`${index}-${step}`}
                      className="text-sm leading-6 text-[var(--warm-gray)]"
                    >
                      <MathText text={`${index + 1}. ${step}`} />
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-[20px] bg-[var(--oat)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--mocha)]">
            standard solution first
          </p>
          <h3 className="mt-2 text-xl font-semibold text-[var(--charcoal)]">
            标准解法关键步骤
          </h3>
          <StandardSolutionContent blocks={standardSolutionBlocks} />
          <div className="mt-4 border-t border-[var(--light-gray)] pt-4">
            <p className="text-sm font-semibold text-[var(--charcoal)]">
              关键判断点
            </p>
            <div className="mt-3 grid gap-2">
              {diagnosis.solution_highlights.map((item, index) => (
                <p
                  key={item}
                  className="flex gap-2 text-sm leading-6 text-[var(--warm-gray)]"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-[var(--mocha)]">
                    {index + 1}
                  </span>
                  <span>
                    <MathText text={item} />
                  </span>
                </p>
              ))}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

