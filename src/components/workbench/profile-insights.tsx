import type { ReactElement } from "react";
import {
  mistakeHistory,
  type StudentProfile,
} from "@/data/mathtrace-demo";
import type { DiagnosisViewModel } from "@/lib/diagnosis/diagnosis-view-model";
import { createProfileInsightsViewModel } from "@/components/workbench/profile-view-model";
import { SectionHeader } from "@/components/workbench/section-header";

export function ProfileInsights({
  diagnosis,
  beforeProfile,
  afterProfile,
  onResetProfile,
  isResetDisabled,
}: {
  diagnosis: DiagnosisViewModel;
  beforeProfile: StudentProfile;
  afterProfile: StudentProfile | null;
  onResetProfile: () => void;
  isResetDisabled: boolean;
}): ReactElement {
  const viewModel = createProfileInsightsViewModel({
    diagnosis,
    beforeProfile,
    afterProfile,
    mistakeHistoryLength: mistakeHistory.length,
  });

  return (
    <section className="mathtrace-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--oat)] p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <SectionHeader
          kicker="Long-term memory"
          title={viewModel.title}
          description={viewModel.description}
        />
        <button
          type="button"
          onClick={onResetProfile}
          disabled={isResetDisabled}
          className="min-h-10 w-fit rounded-full border border-[var(--light-gray)] bg-white px-4 text-sm font-medium text-[var(--warm-gray)] hover:border-[var(--mocha-light)] hover:text-[var(--mocha)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          重置画像
        </button>
      </div>

      <div className="p-5 sm:p-6">
        {viewModel.notPersistedMessage ? (
          <p className="mb-5 rounded-[16px] bg-[var(--amber-bg)] px-4 py-3 text-sm leading-6 text-[var(--amber-text)]">
            {viewModel.notPersistedMessage}
          </p>
        ) : null}

        <section>
          <p className="text-sm font-semibold text-[var(--charcoal)]">
            本次诊断结论
          </p>
          {viewModel.conclusionRows.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {viewModel.conclusionRows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-[var(--oat)] bg-white px-4 py-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--charcoal)]">
                        {row.name}
                      </p>
                      <p className="mt-1 text-xs text-[var(--warm-gray)]">
                        {row.summary}
                      </p>
                    </div>
                    <span className={getWeaknessPillClassName(row.status.tone)}>
                      薄弱指数 {row.weaknessIndex}
                      {formatSignedDelta(row.weaknessDelta)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-lg bg-[var(--oat)] px-4 py-3 text-sm leading-6 text-[var(--warm-gray)]">
              本次没有新增知识点薄弱信号，先按当前错题报告完成订正。
            </p>
          )}
          <p className="mt-4 rounded-lg bg-[var(--soft-green)] px-4 py-3 text-sm leading-6 text-[var(--deep-green)]">
            {viewModel.actionAdvice}
          </p>
        </section>

        <details className="mt-6 rounded-lg border border-[var(--oat)] bg-white px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--charcoal)]">
            全部知识点优先级
          </summary>
          <div className="mt-4 grid gap-3">
            {viewModel.priorityRows.map((row, index) => (
              <div
                key={row.id}
                className="flex flex-col gap-1 border-t border-[var(--oat)] pt-3 text-sm first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium text-[var(--charcoal)]">
                  {index + 1}. {row.name}
                </span>
                <span className="text-[var(--warm-gray)]">
                  薄弱指数 {row.weaknessIndex} · {row.status.label}
                </span>
              </div>
            ))}
          </div>
        </details>

        <section className="mt-6">
          <p className="text-sm font-semibold text-[var(--charcoal)]">
            需要关注的错因
          </p>
          {viewModel.emptyCauseMessage ? (
            <p className="mt-3 rounded-lg bg-[var(--oat)] px-4 py-3 text-sm leading-6 text-[var(--warm-gray)]">
              {viewModel.emptyCauseMessage}
            </p>
          ) : (
            <div className="mt-4 grid gap-3">
              {viewModel.highlightedMistakeCauses.map((cause) => (
                <div
                  key={cause.id}
                  className="rounded-lg border border-[var(--oat)] bg-white px-4 py-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--charcoal)]">
                        {cause.title}
                        {cause.isHighFrequency ? (
                          <span className="ml-2 rounded-full bg-[var(--amber-bg)] px-2 py-0.5 text-xs text-[var(--amber-text)]">
                            高频
                          </span>
                        ) : null}
                        {cause.isNewInDiagnosis ? (
                          <span className="ml-2 rounded-full bg-[var(--soft-green)] px-2 py-0.5 text-xs text-[var(--deep-green)]">
                            本次新增
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-[var(--warm-gray)]">
                        {cause.description}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-[var(--charcoal)]">
                      累计 {cause.nextCount} 次{formatSignedDelta(cause.delta)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {viewModel.otherMistakeCauses.length > 0 ? (
            <details className="mt-3 rounded-lg bg-[var(--oat)] px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-[var(--charcoal)]">
                其他错因（近期无变化）
              </summary>
              <div className="mt-3 grid gap-2">
                {viewModel.otherMistakeCauses.map((cause) => (
                  <div
                    key={cause.id}
                    className="flex items-center justify-between gap-3 text-sm text-[var(--warm-gray)]"
                  >
                    <span>{cause.title}</span>
                    <span>{cause.nextCount} 次（无变化）</span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </section>

        <section className="mt-6 rounded-lg bg-[var(--soft-green)] px-4 py-4">
          <p className="text-sm font-semibold text-[var(--deep-green)]">
            推荐依据
          </p>
          <p className="mt-3 text-sm font-medium text-[var(--charcoal)]">
            {viewModel.recommendation.title}
          </p>
          <ul className="mt-2 grid gap-2 text-sm leading-6 text-[var(--warm-gray)]">
            {viewModel.recommendation.bullets.map((bullet, index) => (
              <li key={`${index}-${bullet}`}>· {bullet}</li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}

function formatSignedDelta(delta: number): string {
  if (delta > 0) {
    return `（+${delta}）`;
  }

  if (delta < 0) {
    return `（${delta}）`;
  }

  return "";
}

function getWeaknessPillClassName(
  tone: "high" | "medium" | "low" | "stable",
): string {
  const baseClassName = "w-fit rounded-full px-3 py-1 text-xs font-semibold";

  if (tone === "high") {
    return `${baseClassName} bg-[var(--amber-bg)] text-[var(--amber-text)]`;
  }

  if (tone === "medium") {
    return `${baseClassName} bg-[var(--oat)] text-[var(--mocha)]`;
  }

  if (tone === "low") {
    return `${baseClassName} bg-[var(--soft-green)] text-[var(--deep-green)]`;
  }

  return `${baseClassName} bg-white text-[var(--warm-gray)]`;
}
