import type { ReactElement } from "react";
import {
  demoStudentContext,
  mistakeHistory,
  type StudentProfile,
} from "@/data/mathtrace-demo";
import type { DiagnosisViewModel } from "@/lib/diagnosis/diagnosis-view-model";
import { clampScore } from "@/lib/shared/utils";
import {
  getKnowledgeName,
  getMistakeShortName,
} from "@/components/workbench/workbench-labels";
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
  const changedKnowledgeIds = Object.keys(
    diagnosis.memory_delta.knowledge_mastery_changes,
  );
  const shouldPreviewDelta =
    diagnosis.should_persist_profile || afterProfile !== null;
  const profileRows = changedKnowledgeIds.map((id) => {
    const currentScore = beforeProfile.mastery_scores[id] ?? 70;
    const change = diagnosis.memory_delta.knowledge_mastery_changes[id] ?? 0;
    const nextScore =
      afterProfile?.mastery_scores[id] ??
      (shouldPreviewDelta ? clampScore(currentScore + change) : currentScore);

    return {
      id,
      currentScore,
      nextScore,
      change: nextScore - currentScore,
    };
  });
  const mistakeCauseIds = [
    ...Object.keys(beforeProfile.frequent_mistake_causes),
    ...Object.keys(diagnosis.memory_delta.mistake_cause_changes),
  ].filter((id, index, ids) => ids.indexOf(id) === index);
  const mistakeCauseRows = mistakeCauseIds.map((id) => {
    const count = beforeProfile.frequent_mistake_causes[id] ?? 0;
    const nextCount = shouldPreviewDelta
      ? count + (diagnosis.memory_delta.mistake_cause_changes[id] ?? 0)
      : count;

    return {
      id,
      previousCount: count,
      nextCount: afterProfile?.frequent_mistake_causes[id] ?? nextCount,
    };
  });

  return (
    <section className="mathtrace-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--oat)] p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <SectionHeader
          kicker="Long-term memory"
          title="画像变化"
          description={`基于 ${mistakeHistory.length} 条 mock 历史错题，展示本次 memory_delta 如何影响长期学习画像。`}
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
        {!diagnosis.should_persist_profile ? (
          <p className="mb-5 rounded-[16px] bg-[var(--amber-bg)] px-4 py-3 text-sm leading-6 text-[var(--amber-text)]">
            本次仅展示诊断建议，未写入本地学生画像。
          </p>
        ) : null}
        <p className="text-sm font-semibold text-[var(--charcoal)]">掌握度变化</p>
        <div className="mt-5 grid gap-5">
          {profileRows.map((row) => (
            <div key={row.id}>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-[var(--charcoal)]">
                  {getKnowledgeName(row.id)}
                </span>
                <span className="text-[var(--warm-gray)]">
                  {row.currentScore} → {row.nextScore}
                  {row.change < 0 ? ` (${row.change})` : ""}
                </span>
              </div>
              <div className="h-2 rounded-full bg-[var(--oat)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--mocha)] to-[var(--deep-green)]"
                  style={{ width: `${row.nextScore}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-[var(--oat)] p-5">
            <p className="text-sm font-semibold text-[var(--charcoal)]">高频错因</p>
            <div className="mt-4 grid gap-3">
              {mistakeCauseRows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-3 text-sm text-[var(--warm-gray)]"
                >
                  <span>{getMistakeShortName(row.id)}</span>
                  <span className="font-semibold text-[var(--charcoal)]">
                    {row.previousCount} → {row.nextCount} 次
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-[var(--oat)] p-5">
            <p className="text-sm font-semibold text-[var(--charcoal)]">长期价值对比</p>
            <div className="mt-4 grid gap-3 text-sm leading-6 text-[var(--warm-gray)]">
              <p>第 1 次：系统只能指出这道题错在分类讨论。</p>
              <p>
                第 {demoStudentContext.usage_count} 次：系统把参数分类讨论提升为高考冲刺优先级第一位。
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
