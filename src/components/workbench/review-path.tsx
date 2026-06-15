import type { ReactElement } from "react";
import type { DiagnosisViewModel } from "@/lib/diagnosis/diagnosis-view-model";
import { SectionHeader } from "@/components/workbench/section-header";

export function ReviewPath({
  diagnosis,
}: {
  diagnosis: DiagnosisViewModel;
}): ReactElement {
  const priorityPlan = diagnosis.review_plan.seven_days.slice(0, 3);

  return (
    <section className="mathtrace-card overflow-hidden">
      <div className="border-b border-[var(--oat)] p-5 sm:p-6">
        <SectionHeader
          kicker="Review plan"
          title="下一步计划"
          description={diagnosis.review_plan.tomorrow}
        />
      </div>

      <div className="p-5 sm:p-6">
        <div className="rounded-[20px] bg-[var(--oat)] p-5">
          <p className="text-sm font-semibold text-[var(--charcoal)]">今日任务</p>
          <p className="mt-3 text-sm leading-6 text-[var(--warm-gray)]">
            {diagnosis.review_plan.tomorrow}
          </p>
        </div>

        <div className="mt-5 grid gap-2">
          {priorityPlan.map((day) => (
            <div
              key={day.day}
              className="flex flex-col gap-3 rounded-[18px] border border-[var(--oat)] bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--mocha)]">
                  Day {day.day}
                </p>
                <h3 className="mt-1 text-base font-semibold text-[var(--charcoal)]">
                  {day.topic}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--warm-gray)]">
                  {day.task}
                </p>
              </div>
              <span className="w-fit rounded-full bg-[var(--oat)] px-2.5 py-1 text-xs font-medium text-[var(--mocha)]">
                {day.estimated_minutes} 分钟
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-[20px] bg-[var(--oat)] p-5">
          <p className="text-sm font-semibold text-[var(--deep-green)]">计划依据</p>
          <div className="mt-3 grid gap-2">
            {diagnosis.review_plan.rationale.map((item) => (
              <p key={item} className="text-sm leading-6 text-[var(--warm-gray)]">
                {item}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
