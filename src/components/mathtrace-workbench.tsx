"use client";

import { useEffect, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { MathText } from "@/components/math-text";
import {
  demoStudentContext,
  demoStudentProfile,
  knowledgePoints,
  mistakeCauses,
  mistakeHistory,
  sampleDiagnoses,
} from "@/data/mathtrace-demo";
import type {
  AgentStep,
  KnowledgePoint,
  PracticeLevel,
  SampleDiagnosis,
  SampleQuestionId,
  Severity,
} from "@/data/mathtrace-demo";

const DEFAULT_SAMPLE_ID: SampleQuestionId = "sample_derivative_001";

const practiceLevelLabels: Record<PracticeLevel, string> = {
  basic: "基础巩固",
  transfer: "同类迁移",
  gaokao_style: "高考综合",
};

const severityLabels: Record<Severity, string> = {
  minor: "轻微",
  medium: "中等",
  severe: "严重",
};

const frequencyLabels: Record<KnowledgePoint["gaokao_frequency"], string> = {
  high: "高频",
  medium: "中频",
  low: "低频",
};

export function MathTraceWorkbench(): ReactElement {
  const [selectedSampleId, setSelectedSampleId] =
    useState<SampleQuestionId>(DEFAULT_SAMPLE_ID);
  const selectedSample = getSampleById(selectedSampleId);
  const [completedStepCount, setCompletedStepCount] = useState(
    selectedSample.steps.length,
  );
  const isDiagnosing = completedStepCount < selectedSample.steps.length;

  useEffect(() => {
    if (completedStepCount >= selectedSample.steps.length) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCompletedStepCount((currentCount) =>
        Math.min(currentCount + 1, selectedSample.steps.length),
      );
    }, 360);

    return () => window.clearTimeout(timeoutId);
  }, [completedStepCount, selectedSample.steps.length]);

  function handleSelectSample(sampleId: SampleQuestionId): void {
    const nextSample = getSampleById(sampleId);
    setSelectedSampleId(sampleId);
    setCompletedStepCount(nextSample.steps.length);
  }

  function handleStartDiagnosis(): void {
    setCompletedStepCount(0);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--cream)] text-[var(--charcoal)]">
      <HeaderBar />

      <div className="mx-auto w-full max-w-[1440px] px-4 pb-12 pt-5 sm:px-6 lg:px-8">
        <section className="grid gap-5 py-5 lg:min-h-[calc(100svh-5rem)] lg:grid-rows-[auto_1fr_auto]">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--mocha)]">
                sample_diagnosis · P0 Demo
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal text-[var(--charcoal)] sm:text-4xl">
                错题诊断工作台
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--warm-gray)]">
                先给出这道题的标准解法，再定位学生错因，并把结果沉淀到长期画像。
              </p>
            </div>

            <div className="mathtrace-card inline-flex w-fit items-center gap-3 px-4 py-3">
              <span className="h-2 w-2 rounded-full bg-[var(--deep-green)]" />
              <span className="text-sm font-medium text-[var(--charcoal)]">
                {demoStudentProfile.grade} · {demoStudentContext.target_exam}
              </span>
            </div>
          </div>

          <AgentTimeline
            steps={selectedSample.steps}
            completedStepCount={completedStepCount}
            isDiagnosing={isDiagnosing}
          />

          <div className="grid items-stretch gap-5 lg:grid-cols-2">
            <MistakeInputCard
              selectedSample={selectedSample}
              selectedSampleId={selectedSampleId}
              isDiagnosing={isDiagnosing}
              onSelectSample={handleSelectSample}
              onStartDiagnosis={handleStartDiagnosis}
            />
            <DiagnosisResultCard sample={selectedSample} />
          </div>
        </section>

        <PracticeLab sample={selectedSample} />

        <section className="mt-8 grid gap-8 xl:grid-cols-[0.92fr_1.08fr]">
          <ProfileInsights sample={selectedSample} />
          <ReviewPath sample={selectedSample} />
        </section>
      </div>
    </main>
  );
}

function HeaderBar(): ReactElement {
  return (
    <header className="mathtrace-glass sticky top-0 z-50">
      <div className="mx-auto flex min-h-16 w-full max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--mocha)] to-[var(--mocha-dark)] text-sm font-semibold text-white shadow-lg shadow-[#a67b5b]/20">
            MT
          </div>
          <div>
            <p className="text-sm font-medium leading-none tracking-wide text-[var(--charcoal)]">
              MathTrace
            </p>
            <p className="mt-1 text-xs text-[var(--warm-gray)]">sample_diagnosis</p>
          </div>
        </div>

        <div className="hidden items-center gap-6 text-sm text-[var(--warm-gray)] md:flex">
          <span>错因诊断</span>
          <span>长期画像</span>
          <span>7 天复习</span>
        </div>

        <div className="rounded-full bg-white px-3 py-2 text-xs font-medium text-[var(--mocha)] shadow-[0_2px_12px_rgba(166,123,91,0.05)]">
          demo_student_001
        </div>
      </div>
    </header>
  );
}

function MistakeInputCard({
  selectedSample,
  selectedSampleId,
  isDiagnosing,
  onSelectSample,
  onStartDiagnosis,
}: {
  selectedSample: SampleDiagnosis;
  selectedSampleId: SampleQuestionId;
  isDiagnosing: boolean;
  onSelectSample: (sampleId: SampleQuestionId) => void;
  onStartDiagnosis: () => void;
}): ReactElement {
  return (
    <div className="mathtrace-card h-full p-5 sm:p-6">
      <SectionHeader
        kicker="Mistake input"
        title="上传/选择错题"
        description="P0 正式演示使用内置样例题；图片上传入口保留为 P1 灰态。"
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
        <button
          type="button"
          disabled
          className="min-h-12 rounded-full border border-dashed border-[var(--light-gray)] bg-[var(--oat)] px-4 text-left text-sm font-medium text-[var(--warm-gray)] disabled:cursor-not-allowed"
        >
          图片上传 · P1 即将开放
        </button>
        <button
          type="button"
          disabled={isDiagnosing}
          onClick={onStartDiagnosis}
          className="mathtrace-hover-lift min-h-12 cursor-pointer rounded-full bg-gradient-to-r from-[var(--mocha)] to-[var(--mocha-dark)] px-6 text-sm font-semibold text-white shadow-lg shadow-[#a67b5b]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isDiagnosing ? "诊断中" : "开始诊断"}
        </button>
      </div>

      <div className="mt-5 grid gap-3">
        {sampleDiagnoses.map((sample) => {
          const isSelected = sample.id === selectedSampleId;

          return (
            <button
              key={sample.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelectSample(sample.id)}
              className={`mathtrace-hover-lift min-h-20 cursor-pointer rounded-[20px] border p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mocha)] ${
                isSelected
                  ? "border-[var(--mocha)] bg-[var(--mocha-muted)]"
                  : "border-[var(--oat)] bg-white hover:border-[var(--mocha-light)] hover:shadow-[0_8px_24px_rgba(166,123,91,0.08)]"
              }`}
            >
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--warm-gray)]">
                {sample.module}
              </span>
              <span className="mt-2 block text-lg font-medium text-[var(--charcoal)]">
                {sample.title}
              </span>
              <span className="mt-2 block text-sm leading-6 text-[var(--warm-gray)]">
                难度 {sample.difficulty}/5 · {sample.mistake_causes.length} 个错因标签
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 rounded-[20px] bg-[var(--oat)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--mocha)]">
          current sample
        </p>
        <p className="mt-3 text-sm leading-7 text-[var(--warm-gray)]">
          <MathText text={selectedSample.question_text} />
        </p>
      </div>
    </div>
  );
}

function DiagnosisResultCard({
  sample,
}: {
  sample: SampleDiagnosis;
}): ReactElement {
  return (
    <section className="mathtrace-card flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--oat)] p-5 sm:p-6">
        <SectionHeader
          kicker="Diagnosis result"
          title="标准解法与错因"
          description="先看正确解题路径，再对照学生答案定位偏离点。"
        />
      </div>

      <div className="flex flex-1 flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap gap-2">
          {sample.knowledge_points.map((id) => (
            <Tag key={id} tone="green">
              {getKnowledgeName(id)}
            </Tag>
          ))}
          <Tag tone="amber">严重度：{severityLabels[sample.severity]}</Tag>
        </div>

        <div className="rounded-[20px] bg-[var(--oat)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--mocha)]">
            standard solution first
          </p>
          <h3 className="mt-2 text-xl font-semibold text-[var(--charcoal)]">
            标准解法关键步骤
          </h3>
          <p className="mt-3 text-sm leading-7 text-[var(--charcoal)]">
            <MathText text={sample.standard_solution} />
          </p>
          <div className="mt-4 border-t border-[var(--light-gray)] pt-4">
            <p className="text-sm font-semibold text-[var(--charcoal)]">
              关键判断点
            </p>
            <div className="mt-3 grid gap-2">
              {sample.solution_highlights.map((item, index) => (
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

        <div className="rounded-[20px] border border-[var(--oat)] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--charcoal)]">
              学生答案与偏离点
            </p>
            <div className="flex flex-wrap gap-2">
              {sample.mistake_causes.map((id) => (
                <Tag key={id} tone="rust">
                  {getMistakeName(id)}
                </Tag>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[16px] bg-[var(--oat)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--mocha)]">
                student answer
              </p>
              <p className="mt-3 text-sm leading-7 text-[var(--warm-gray)]">
                <MathText text={sample.student_answer} />
              </p>
            </div>

            <div className="rounded-[16px] bg-[var(--oat)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--mocha)]">
                diagnosis conclusion
              </p>
              <p className="mt-3 text-sm leading-7 text-[var(--warm-gray)]">
                <MathText text={getConciseDiagnosis(sample)} />
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[20px] bg-[var(--oat)] p-4">
          <p className="text-sm font-semibold text-[var(--charcoal)]">错误发生步骤</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {sample.step_analysis.map((item) => (
              <span
                key={item}
                className="rounded-full bg-white px-3 py-1.5 text-sm text-[var(--warm-gray)]"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function AgentTimeline({
  steps,
  completedStepCount,
  isDiagnosing,
}: {
  steps: AgentStep[];
  completedStepCount: number;
  isDiagnosing: boolean;
}): ReactElement {
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
          {isDiagnosing ? "正在分析" : "诊断完成"}
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

function PracticeLab({
  sample,
}: {
  sample: SampleDiagnosis;
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
        {sample.practice_questions.map((practice, index) => (
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

function ProfileInsights({
  sample,
}: {
  sample: SampleDiagnosis;
}): ReactElement {
  const changedKnowledgeIds = Object.keys(
    sample.memory_delta.knowledge_mastery_changes,
  );
  const profileRows = changedKnowledgeIds.map((id) => {
    const currentScore = demoStudentProfile.mastery_scores[id] ?? 70;
    const change = sample.memory_delta.knowledge_mastery_changes[id] ?? 0;

    return {
      id,
      currentScore,
      nextScore: clampScore(currentScore + change),
      change,
    };
  });
  const mistakeCauseRows = Object.entries(
    demoStudentProfile.frequent_mistake_causes,
  ).map(([id, count]) => ({
    id,
    previousCount: count,
    nextCount: count + (sample.memory_delta.mistake_cause_changes[id] ?? 0),
  }));

  return (
    <section className="mathtrace-card overflow-hidden">
      <div className="border-b border-[var(--oat)] p-5 sm:p-6">
        <SectionHeader
          kicker="Long-term memory"
          title="画像变化"
          description={`基于 ${mistakeHistory.length} 条 mock 历史错题，展示本次 memory_delta 如何影响长期学习画像。`}
        />
      </div>

      <div className="p-5 sm:p-6">
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

function ReviewPath({
  sample,
}: {
  sample: SampleDiagnosis;
}): ReactElement {
  const priorityPlan = sample.review_plan.seven_days.slice(0, 3);

  return (
    <section className="mathtrace-card overflow-hidden">
      <div className="border-b border-[var(--oat)] p-5 sm:p-6">
        <SectionHeader
          kicker="Review plan"
          title="下一步计划"
          description={sample.review_plan.tomorrow}
        />
      </div>

      <div className="p-5 sm:p-6">
        <div className="rounded-[20px] bg-[var(--oat)] p-5">
          <p className="text-sm font-semibold text-[var(--charcoal)]">今日任务</p>
          <p className="mt-3 text-sm leading-6 text-[var(--warm-gray)]">
            {sample.review_plan.tomorrow}
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
            {sample.review_plan.rationale.map((item) => (
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

function SectionHeader({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description: string;
}): ReactElement {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--mocha)]">
        {kicker}
      </p>
      <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-normal text-[var(--charcoal)] sm:text-3xl">
        {title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--warm-gray)]">
        {description}
      </p>
    </div>
  );
}

function Tag({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "green" | "amber" | "rust";
}): ReactElement {
  const toneClassName = {
    amber: "bg-[var(--amber-bg)] text-[var(--amber-text)]",
    green: "bg-[var(--deep-green-muted)] text-[var(--deep-green)]",
    rust: "bg-[var(--mocha-muted)] text-[var(--mocha)]",
  }[tone];

  return (
    <span className={`rounded px-2.5 py-1 text-xs font-semibold ${toneClassName}`}>
      {children}
    </span>
  );
}

function getSampleById(sampleId: SampleQuestionId): SampleDiagnosis {
  return (
    sampleDiagnoses.find((sample) => sample.id === sampleId) ?? sampleDiagnoses[0]
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

function getKnowledgeName(id: string): string {
  const knowledgePoint = knowledgePoints[id];

  if (!knowledgePoint) {
    return id;
  }

  const frequency = frequencyLabels[knowledgePoint.gaokao_frequency];
  return `${knowledgePoint.display_name} · ${frequency}`;
}

function getMistakeName(id: string): string {
  return mistakeCauses[id]?.display_name ?? id;
}

function getMistakeShortName(id: string): string {
  return mistakeCauses[id]?.short_name ?? id;
}

function getConciseDiagnosis(sample: SampleDiagnosis): string {
  if (sample.mistake_causes.length === 0) {
    return sample.expected_diagnosis;
  }

  return `偏离点：${sample.mistake_causes.map(getMistakeName).join("、")}。`;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}
