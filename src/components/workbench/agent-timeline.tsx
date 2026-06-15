import type { ReactElement } from "react";
import type { AgentStep } from "@/data/mathtrace-demo";
import { createAgentTimelineStatusLabel } from "@/lib/diagnosis/diagnosis-view-model";

export function AgentTimeline({
  steps,
  completedStepCount,
  isDiagnosing,
  isAwaitingConfirmation,
  hasRetainedReportNotice,
}: {
  steps: AgentStep[];
  completedStepCount: number;
  isDiagnosing: boolean;
  isAwaitingConfirmation: boolean;
  hasRetainedReportNotice: boolean;
}): ReactElement {
  const statusLabel = createAgentTimelineStatusLabel({
    isDiagnosing,
    isAwaitingConfirmation,
    hasRetainedReportNotice,
  });

  return (
    <section className="mathtrace-card overflow-hidden p-5 text-[var(--charcoal)] sm:p-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--mocha)]">
            Learning Coach Agent
          </p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">诊断流程</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--warm-gray)]">
            识别、映射、诊断、画像、练习和复习一次完成。
          </p>
        </div>
        <span className="w-fit rounded-full bg-[var(--oat)] px-3 py-1 text-xs font-medium text-[var(--warm-gray)]">
          {statusLabel}
        </span>
      </div>

      <div className="mt-8 overflow-x-auto pb-2">
        <ol className="mx-auto grid min-w-[980px] max-w-[1220px] grid-cols-6">
          {steps.map((step, index) => {
            const stepState = getStepState(index, completedStepCount, isDiagnosing);
            const isLastStep = index === steps.length - 1;

            return (
              <li key={step.id} className="relative pr-6">
                {!isLastStep ? (
                  <span
                    className={`absolute left-12 right-0 top-6 h-px ${
                      stepState === "done"
                        ? "bg-[var(--deep-green)]"
                        : "bg-[var(--light-gray)]"
                    }`}
                    aria-hidden="true"
                  />
                ) : null}

                <div className="relative z-10 flex h-12 items-center">
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-full border text-lg font-semibold shadow-[0_8px_24px_rgba(166,123,91,0.08)] ${
                      stepState === "active"
                        ? "border-[var(--mocha)] bg-[var(--mocha)] text-white"
                        : stepState === "done"
                          ? "border-[var(--deep-green)] bg-white text-[var(--deep-green)]"
                          : "border-[var(--light-gray)] bg-white text-[var(--warm-gray)]"
                    }`}
                  >
                    {index + 1}
                  </span>
                </div>

                <div className="mt-5 min-h-28">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-lg font-semibold text-[var(--charcoal)]">
                      {step.display_name}
                    </p>
                    <p className="shrink-0 text-sm font-medium text-[var(--warm-gray)]">
                      {stepState === "active"
                        ? "进行中"
                        : stepState === "done"
                          ? `${step.duration_ms}ms`
                          : "等待"}
                    </p>
                  </div>
                  <p className="mt-3 max-w-[13rem] text-sm leading-6 text-[var(--warm-gray)]">
                    {step.summary}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function getStepState(
  index: number,
  completedStepCount: number,
  isDiagnosing: boolean,
): "active" | "done" | "pending" {
  if (index < completedStepCount) {
    return "done";
  }

  if (isDiagnosing && index === completedStepCount) {
    return "active";
  }

  return "pending";
}
