"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ChangeEvent, ReactElement, ReactNode } from "react";
import { ImageUploadPanel } from "@/components/image-upload-panel";
import { MathText } from "@/components/math-text";
import {
  demoStudentContext,
  demoStudentProfile,
  knowledgePoints,
  mistakeCauses,
  mistakeHistory,
  sampleDiagnoses,
} from "@/data/mathtrace-demo";
import {
  clearStoredStudentProfile,
  readStoredStudentProfile,
  writeStoredStudentProfile,
} from "@/lib/demo-state";
import {
  requestConfirmedImageDiagnosis,
  requestImageExtractionReview,
  requestSampleDiagnosis,
  shouldPersistDiagnoseProfile,
} from "@/lib/diagnose-client";
import {
  canConfirmEditableExtractionDraft,
  createAgentTimelineStatusLabel,
  createEditableExtractionDraft,
  createExtractionReviewRetainedReportNotice,
  createImageDiagnosisViewModel,
  createRetainedReportNotice,
  createSampleDiagnosisViewModel,
  createVisionExtractionDraftFromEditableDraft,
} from "@/lib/diagnosis-view-model";
import { parseConfirmedExtractionDraft } from "@/lib/image-confirmation";
import type {
  AgentStep,
  KnowledgePoint,
  PracticeLevel,
  SampleDiagnosis,
  SampleQuestionId,
  Severity,
  StudentProfile,
} from "@/data/mathtrace-demo";
import type {
  DiagnosisViewModel,
  EditableExtractionDraft,
} from "@/lib/diagnosis-view-model";
import type { PreparedImageUpload } from "@/lib/image-upload-client";
import { clampScore } from "@/lib/utils";

const DEFAULT_SAMPLE_ID: SampleQuestionId = "sample_derivative_001";

type DiagnosisMode = "sample" | "image";

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

interface ProfilePreview {
  beforeProfile: StudentProfile;
  afterProfile: StudentProfile | null;
}

export function MathTraceWorkbench(): ReactElement {
  const hasHydrated = useHasHydrated();
  const restoredStudentProfile = hasHydrated
    ? readStoredStudentProfile(window.localStorage)
    : demoStudentProfile;
  const [selectedSampleId, setSelectedSampleId] =
    useState<SampleQuestionId>(DEFAULT_SAMPLE_ID);
  const selectedSample = getSampleById(selectedSampleId);
  const [diagnosisMode, setDiagnosisMode] = useState<DiagnosisMode>("sample");
  const [selectedImage, setSelectedImage] = useState<PreparedImageUpload | null>(
    null,
  );
  const [isImagePreparing, setIsImagePreparing] = useState(false);
  const [imageUploadErrorMessage, setImageUploadErrorMessage] = useState<
    string | null
  >(null);
  const [editableExtractionDraft, setEditableExtractionDraft] =
    useState<EditableExtractionDraft | null>(null);
  const [diagnosisView, setDiagnosisView] = useState<DiagnosisViewModel>(() =>
    createSampleDiagnosisViewModel(selectedSample),
  );
  const [sessionStudentProfile, setSessionStudentProfile] =
    useState<StudentProfile | null>(null);
  const studentProfile = sessionStudentProfile ?? restoredStudentProfile;
  const [profilePreview, setProfilePreview] = useState<ProfilePreview | null>(
    null,
  );
  const visibleProfilePreview = profilePreview ?? {
    beforeProfile: studentProfile,
    afterProfile: null,
  };
  const [completedStepCount, setCompletedStepCount] = useState(
    selectedSample.steps.length,
  );
  const [isTimelineAnimating, setIsTimelineAnimating] = useState(false);
  const [isRequestPending, setIsRequestPending] = useState(false);
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);
  const [retainedReportNotice, setRetainedReportNotice] = useState<string | null>(
    null,
  );
  const isDiagnosisRequestLockedRef = useRef(false);
  const isTimelineRunning =
    isTimelineAnimating && completedStepCount < diagnosisView.steps.length;
  const isDiagnosing = isRequestPending || isTimelineRunning;

  useEffect(() => {
    if (!isTimelineAnimating) {
      return;
    }

    if (completedStepCount >= diagnosisView.steps.length) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCompletedStepCount((currentCount) =>
        Math.min(currentCount + 1, diagnosisView.steps.length),
      );
    }, 360);

    return () => window.clearTimeout(timeoutId);
  }, [completedStepCount, diagnosisView.steps.length, isTimelineAnimating]);

  function handleSelectSample(sampleId: SampleQuestionId): void {
    const nextSample = getSampleById(sampleId);
    setSelectedSampleId(sampleId);
    setDiagnosisMode("sample");
    setDiagnosisView(createSampleDiagnosisViewModel(nextSample));
    setEditableExtractionDraft(null);
    setApiErrorMessage(null);
    setRetainedReportNotice(null);
    setImageUploadErrorMessage(null);
    setProfilePreview(null);
    setCompletedStepCount(nextSample.steps.length);
    setIsTimelineAnimating(false);
  }

  function handleSelectMode(nextMode: DiagnosisMode): void {
    if (isDiagnosing || nextMode === diagnosisMode) {
      return;
    }

    setDiagnosisMode(nextMode);
    setEditableExtractionDraft(null);
    setApiErrorMessage(null);
    setRetainedReportNotice(null);
    setImageUploadErrorMessage(null);
    setIsTimelineAnimating(false);

    if (nextMode === "sample") {
      const nextSample = getSampleById(selectedSampleId);
      setDiagnosisView(createSampleDiagnosisViewModel(nextSample));
      setProfilePreview(null);
      setCompletedStepCount(nextSample.steps.length);
    }
  }

  function handleImagePrepareStart(): void {
    setIsImagePreparing(true);
    setEditableExtractionDraft(null);
    setImageUploadErrorMessage(null);
    setApiErrorMessage(null);
    setRetainedReportNotice(null);
  }

  function handleImagePrepared(image: PreparedImageUpload): void {
    setSelectedImage(image);
    setEditableExtractionDraft(null);
    setIsImagePreparing(false);
    setImageUploadErrorMessage(null);
  }

  function handleImagePrepareError(message: string): void {
    setSelectedImage(null);
    setEditableExtractionDraft(null);
    setIsImagePreparing(false);
    setImageUploadErrorMessage(message);
  }

  function handleClearImage(): void {
    if (isDiagnosing) {
      return;
    }

    setSelectedImage(null);
    setEditableExtractionDraft(null);
    setImageUploadErrorMessage(null);
  }

  function handleStartDiagnosis(): void {
    if (isDiagnosing || isDiagnosisRequestLockedRef.current) {
      return;
    }

    void requestDiagnosis();
  }

  function handleUpdateEditableExtractionDraft(
    draft: EditableExtractionDraft,
  ): void {
    setEditableExtractionDraft(draft);
    setApiErrorMessage(null);
  }

  function handleConfirmExtraction(): void {
    if (
      isDiagnosing ||
      isImagePreparing ||
      isDiagnosisRequestLockedRef.current ||
      editableExtractionDraft === null ||
      !canConfirmEditableExtractionDraft(editableExtractionDraft)
    ) {
      return;
    }

    void requestConfirmedDiagnosis(editableExtractionDraft);
  }

  function handleResetProfile(): void {
    if (isDiagnosing) {
      return;
    }

    clearStoredStudentProfile(window.localStorage);
    setSessionStudentProfile(demoStudentProfile);
    setProfilePreview({
      beforeProfile: demoStudentProfile,
      afterProfile: null,
    });
    setApiErrorMessage(null);
    setRetainedReportNotice(null);
  }

  async function requestDiagnosis(): Promise<void> {
    if (isDiagnosisRequestLockedRef.current) {
      return;
    }

    if (diagnosisMode === "image" && !selectedImage) {
      setImageUploadErrorMessage("请先上传一张数学错题图片。");
      return;
    }

    isDiagnosisRequestLockedRef.current = true;
    const profileBeforeDiagnosis = studentProfile;
    const fallbackSample = getSampleById(selectedSampleId);
    setProfilePreview({
      beforeProfile: profileBeforeDiagnosis,
      afterProfile: null,
    });
    setApiErrorMessage(null);
    setImageUploadErrorMessage(null);
    setEditableExtractionDraft(null);
    setCompletedStepCount(0);
    setIsTimelineAnimating(true);
    setIsRequestPending(true);

    try {
      if (diagnosisMode === "sample") {
        const diagnosis = await requestSampleDiagnosis({
          fetcher: window.fetch.bind(window),
          sample_question_id: selectedSampleId,
          student_profile: profileBeforeDiagnosis,
          mistake_history: mistakeHistory,
        });
        const nextView = createSampleDiagnosisViewModel(
          diagnosis.sample_diagnosis,
        );
        setDiagnosisView(nextView);
        setRetainedReportNotice(null);
        setSessionStudentProfile(diagnosis.student_profile);
        writeStoredStudentProfile(window.localStorage, diagnosis.student_profile);
        setProfilePreview({
          beforeProfile: profileBeforeDiagnosis,
          afterProfile: diagnosis.student_profile,
        });
        return;
      }

      if (!selectedImage) {
        throw new Error("请先上传一张数学错题图片。");
      }

      const extractionReview = await requestImageExtractionReview({
        fetcher: window.fetch.bind(window),
        image_base64: selectedImage.image_base64,
        image_mime_type: selectedImage.image_mime_type,
        student_profile: profileBeforeDiagnosis,
        mistake_history: mistakeHistory,
      });
      setEditableExtractionDraft(
        createEditableExtractionDraft(extractionReview),
      );
      setRetainedReportNotice(
        createExtractionReviewRetainedReportNotice(diagnosisView),
      );
      setCompletedStepCount(1);
      setIsTimelineAnimating(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "诊断接口暂时不可用，已保留当前结果。";
      setApiErrorMessage(message);
      if (diagnosisMode === "sample") {
        setDiagnosisView(createSampleDiagnosisViewModel(fallbackSample));
        setRetainedReportNotice(null);
      } else {
        setRetainedReportNotice(
          createRetainedReportNotice(diagnosisView, message),
        );
      }
      setIsTimelineAnimating(false);
      setCompletedStepCount(
        diagnosisMode === "sample"
          ? fallbackSample.steps.length
          : diagnosisView.steps.length,
      );
      setProfilePreview({
        beforeProfile: profileBeforeDiagnosis,
        afterProfile: null,
      });
    } finally {
      setIsRequestPending(false);
      isDiagnosisRequestLockedRef.current = false;
    }
  }

  async function requestConfirmedDiagnosis(
    draft: EditableExtractionDraft,
  ): Promise<void> {
    if (isDiagnosisRequestLockedRef.current) {
      return;
    }

    const confirmedExtractionDraft =
      createVisionExtractionDraftFromEditableDraft(draft);
    const parsedDraft = parseConfirmedExtractionDraft(confirmedExtractionDraft);

    if (!parsedDraft.ok) {
      setApiErrorMessage(parsedDraft.message);
      setCompletedStepCount(1);
      setIsTimelineAnimating(false);
      return;
    }

    isDiagnosisRequestLockedRef.current = true;
    const profileBeforeDiagnosis = studentProfile;
    setProfilePreview({
      beforeProfile: profileBeforeDiagnosis,
      afterProfile: null,
    });
    setApiErrorMessage(null);
    setImageUploadErrorMessage(null);
    setRetainedReportNotice(null);
    setCompletedStepCount(0);
    setIsTimelineAnimating(true);
    setIsRequestPending(true);

    try {
      const diagnosis = await requestConfirmedImageDiagnosis({
        fetcher: window.fetch.bind(window),
        confirmation_token: draft.confirmation_token,
        confirmed_extraction: parsedDraft.value,
        student_profile: profileBeforeDiagnosis,
        mistake_history: mistakeHistory,
      });
      const nextView = createImageDiagnosisViewModel(diagnosis);
      setDiagnosisView(nextView);
      setEditableExtractionDraft(null);
      setRetainedReportNotice(null);

      if (shouldPersistDiagnoseProfile(diagnosis)) {
        setSessionStudentProfile(diagnosis.student_profile);
        writeStoredStudentProfile(window.localStorage, diagnosis.student_profile);
        setProfilePreview({
          beforeProfile: profileBeforeDiagnosis,
          afterProfile: diagnosis.student_profile,
        });
      } else {
        setProfilePreview({
          beforeProfile: profileBeforeDiagnosis,
          afterProfile: null,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "诊断接口暂时不可用，已保留当前结果。";
      setApiErrorMessage(message);
      setRetainedReportNotice(createRetainedReportNotice(diagnosisView, message));
      setCompletedStepCount(1);
      setIsTimelineAnimating(false);
      setProfilePreview({
        beforeProfile: profileBeforeDiagnosis,
        afterProfile: null,
      });
    } finally {
      setIsRequestPending(false);
      isDiagnosisRequestLockedRef.current = false;
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--cream)] text-[var(--charcoal)]">
      <HeaderBar mode={diagnosisMode} />

      <div className="mx-auto w-full max-w-[1440px] px-4 pb-12 pt-5 sm:px-6 lg:px-8">
        <section className="grid gap-5 py-5 lg:min-h-[calc(100svh-5rem)] lg:grid-rows-[auto_1fr_auto]">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--mocha)]">
                {diagnosisMode === "image"
                  ? "image_diagnosis · P1 Experience"
                  : "sample_diagnosis · P0 Demo"}
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
            steps={diagnosisView.steps}
            completedStepCount={completedStepCount}
            isDiagnosing={isDiagnosing}
            isAwaitingConfirmation={editableExtractionDraft !== null}
            hasRetainedReportNotice={retainedReportNotice !== null}
          />

          <div className="grid items-stretch gap-5 lg:grid-cols-2">
            <MistakeInputCard
              mode={diagnosisMode}
              selectedSample={selectedSample}
              selectedSampleId={selectedSampleId}
              selectedImage={selectedImage}
              editableExtractionDraft={editableExtractionDraft}
              isDiagnosing={isDiagnosing}
              isImagePreparing={isImagePreparing}
              apiErrorMessage={apiErrorMessage}
              imageUploadErrorMessage={imageUploadErrorMessage}
              onSelectMode={handleSelectMode}
              onSelectSample={handleSelectSample}
              onStartDiagnosis={handleStartDiagnosis}
              onUpdateEditableExtractionDraft={handleUpdateEditableExtractionDraft}
              onConfirmExtraction={handleConfirmExtraction}
              onImagePrepareStart={handleImagePrepareStart}
              onImagePrepared={handleImagePrepared}
              onImagePrepareError={handleImagePrepareError}
              onClearImage={handleClearImage}
            />
            <DiagnosisResultCard
              diagnosis={diagnosisView}
              retainedReportNotice={retainedReportNotice}
            />
          </div>
        </section>

        <PracticeLab diagnosis={diagnosisView} />

        <section className="mt-8 grid gap-8 xl:grid-cols-[0.92fr_1.08fr]">
          <ProfileInsights
            diagnosis={diagnosisView}
            beforeProfile={visibleProfilePreview.beforeProfile}
            afterProfile={visibleProfilePreview.afterProfile}
            onResetProfile={handleResetProfile}
            isResetDisabled={isDiagnosing}
          />
          <ReviewPath diagnosis={diagnosisView} />
        </section>
      </div>
    </main>
  );
}

function HeaderBar({ mode }: { mode: DiagnosisMode }): ReactElement {
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
            <p className="mt-1 text-xs text-[var(--warm-gray)]">
              {mode === "image" ? "image_diagnosis" : "sample_diagnosis"}
            </p>
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
  mode,
  selectedSample,
  selectedSampleId,
  selectedImage,
  editableExtractionDraft,
  isDiagnosing,
  isImagePreparing,
  apiErrorMessage,
  imageUploadErrorMessage,
  onSelectMode,
  onSelectSample,
  onStartDiagnosis,
  onUpdateEditableExtractionDraft,
  onConfirmExtraction,
  onImagePrepareStart,
  onImagePrepared,
  onImagePrepareError,
  onClearImage,
}: {
  mode: DiagnosisMode;
  selectedSample: SampleDiagnosis;
  selectedSampleId: SampleQuestionId;
  selectedImage: PreparedImageUpload | null;
  editableExtractionDraft: EditableExtractionDraft | null;
  isDiagnosing: boolean;
  isImagePreparing: boolean;
  apiErrorMessage: string | null;
  imageUploadErrorMessage: string | null;
  onSelectMode: (mode: DiagnosisMode) => void;
  onSelectSample: (sampleId: SampleQuestionId) => void;
  onStartDiagnosis: () => void;
  onUpdateEditableExtractionDraft: (draft: EditableExtractionDraft) => void;
  onConfirmExtraction: () => void;
  onImagePrepareStart: () => void;
  onImagePrepared: (image: PreparedImageUpload) => void;
  onImagePrepareError: (message: string) => void;
  onClearImage: () => void;
}): ReactElement {
  const canStartDiagnosis =
    !isDiagnosing &&
    (mode === "sample" || (selectedImage !== null && !isImagePreparing));
  const canConfirmExtraction =
    editableExtractionDraft !== null &&
    canConfirmEditableExtractionDraft(editableExtractionDraft) &&
    !isDiagnosing &&
    !isImagePreparing;

  function handleEditableDraftChange(
    field:
      | "question_text"
      | "student_answer"
      | "steps_text"
      | "standard_solution_draft",
    event: ChangeEvent<HTMLTextAreaElement>,
  ): void {
    if (editableExtractionDraft === null) {
      return;
    }

    onUpdateEditableExtractionDraft({
      ...editableExtractionDraft,
      [field]: event.target.value,
    });
  }

  return (
    <div className="mathtrace-card h-full p-5 sm:p-6">
      <SectionHeader
        kicker="Mistake input"
        title="上传/选择错题"
        description="样例题保持稳定演示；图片诊断用于真实错题抽取与诊断体验。"
      />

      <div className="mt-5 grid grid-cols-2 rounded-full bg-[var(--oat)] p-1">
        <button
          type="button"
          disabled={isDiagnosing}
          onClick={() => onSelectMode("sample")}
          className={`min-h-10 rounded-full px-4 text-sm font-semibold ${
            mode === "sample"
              ? "bg-white text-[var(--charcoal)] shadow-[0_2px_12px_rgba(166,123,91,0.08)]"
              : "text-[var(--warm-gray)]"
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          样例题
        </button>
        <button
          type="button"
          disabled={isDiagnosing}
          onClick={() => onSelectMode("image")}
          className={`min-h-10 rounded-full px-4 text-sm font-semibold ${
            mode === "image"
              ? "bg-white text-[var(--charcoal)] shadow-[0_2px_12px_rgba(166,123,91,0.08)]"
              : "text-[var(--warm-gray)]"
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          图片诊断
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="min-h-12 truncate rounded-full border border-[var(--light-gray)] bg-[var(--oat)] px-4 py-3 text-sm font-medium text-[var(--warm-gray)]">
          {mode === "image"
            ? selectedImage
              ? selectedImage.file_name
              : "等待上传错题图片"
            : selectedSample.title}
        </div>
        <button
          type="button"
          disabled={!canStartDiagnosis}
          onClick={onStartDiagnosis}
          className="mathtrace-hover-lift min-h-12 cursor-pointer rounded-full bg-gradient-to-r from-[var(--mocha)] to-[var(--mocha-dark)] px-6 text-sm font-semibold text-white shadow-lg shadow-[#a67b5b]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isDiagnosing
            ? "诊断中"
            : mode === "image"
              ? "开始图片诊断"
              : "开始诊断"}
        </button>
      </div>

      {apiErrorMessage ? (
        <div className="mt-3 rounded-[16px] bg-[var(--amber-bg)] px-4 py-3 text-sm leading-6 text-[var(--amber-text)]">
          <p className="whitespace-pre-line">{apiErrorMessage}</p>
          {mode === "image" ? (
            <button
              type="button"
              disabled={isDiagnosing}
              onClick={() => onSelectMode("sample")}
              className="mt-3 min-h-9 rounded-full bg-white px-4 text-sm font-semibold text-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              切回样例题
            </button>
          ) : null}
        </div>
      ) : null}

      {mode === "image" ? (
        <div className="mt-5">
          <ImageUploadPanel
            selectedImage={selectedImage}
            isDisabled={isDiagnosing}
            isPreparing={isImagePreparing}
            errorMessage={imageUploadErrorMessage}
            onPrepareStart={onImagePrepareStart}
            onPrepared={onImagePrepared}
            onPrepareError={onImagePrepareError}
            onClear={onClearImage}
          />

          {editableExtractionDraft ? (
            <div className="mt-4 rounded-[16px] bg-[var(--oat)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--charcoal)]">
                  识别结果确认
                </p>
                <Tag
                  tone={
                    editableExtractionDraft.extraction_confidence === "low"
                      ? "amber"
                      : "green"
                  }
                >
                  置信度：{editableExtractionDraft.extraction_confidence}
                </Tag>
              </div>

              {editableExtractionDraft.extraction_confidence === "low" ? (
                <p className="mt-3 rounded-[16px] bg-[var(--amber-bg)] px-4 py-3 text-sm leading-6 text-[var(--amber-text)]">
                  模型置信度为 low。你仍可确认生成报告，但本次不会写入长期画像。
                </p>
              ) : null}

              {editableExtractionDraft.warnings.length > 0 ? (
                <ul className="mt-3 grid gap-2">
                  {editableExtractionDraft.warnings.map((warning, index) => (
                    <li
                      key={`${index}-${warning}`}
                      className="rounded-[16px] bg-[var(--amber-bg)] px-4 py-3 text-sm leading-6 text-[var(--amber-text)]"
                    >
                      {warning}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-4 grid gap-3">
                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold text-[var(--mocha)]">
                    题干
                  </span>
                  <textarea
                    value={editableExtractionDraft.question_text}
                    rows={4}
                    disabled={isDiagnosing || isImagePreparing}
                    onChange={(event) =>
                      handleEditableDraftChange("question_text", event)
                    }
                    className="min-h-24 resize-y rounded-[16px] border border-[var(--light-gray)] bg-white px-3 py-2 text-sm leading-6 text-[var(--charcoal)] outline-none focus:border-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>

                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold text-[var(--mocha)]">
                    学生答案
                  </span>
                  <textarea
                    value={editableExtractionDraft.student_answer}
                    rows={3}
                    disabled={isDiagnosing || isImagePreparing}
                    onChange={(event) =>
                      handleEditableDraftChange("student_answer", event)
                    }
                    className="min-h-20 resize-y rounded-[16px] border border-[var(--light-gray)] bg-white px-3 py-2 text-sm leading-6 text-[var(--charcoal)] outline-none focus:border-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>

                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold text-[var(--mocha)]">
                    解题步骤
                  </span>
                  <textarea
                    value={editableExtractionDraft.steps_text}
                    rows={4}
                    disabled={isDiagnosing || isImagePreparing}
                    onChange={(event) =>
                      handleEditableDraftChange("steps_text", event)
                    }
                    className="min-h-24 resize-y rounded-[16px] border border-[var(--light-gray)] bg-white px-3 py-2 text-sm leading-6 text-[var(--charcoal)] outline-none focus:border-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>

                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold text-[var(--mocha)]">
                    标准解法草稿
                  </span>
                  <textarea
                    value={editableExtractionDraft.standard_solution_draft}
                    rows={4}
                    disabled={isDiagnosing || isImagePreparing}
                    onChange={(event) =>
                      handleEditableDraftChange(
                        "standard_solution_draft",
                        event,
                      )
                    }
                    className="min-h-24 resize-y rounded-[16px] border border-[var(--light-gray)] bg-white px-3 py-2 text-sm leading-6 text-[var(--charcoal)] outline-none focus:border-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-[var(--warm-gray)]">
                  编辑后可生成报告；画像写入以服务端确认结果为准。
                </p>
                <button
                  type="button"
                  disabled={!canConfirmExtraction}
                  onClick={onConfirmExtraction}
                  className="min-h-10 rounded-full bg-[var(--deep-green)] px-5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(45,95,77,0.16)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-green)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDiagnosing ? "生成报告中" : "确认生成报告"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3">
            {sampleDiagnoses.map((sample) => {
              const isSelected = sample.id === selectedSampleId;

              return (
                <button
                  key={sample.id}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={isDiagnosing}
                  onClick={() => onSelectSample(sample.id)}
                  className={`mathtrace-hover-lift min-h-20 cursor-pointer rounded-[20px] border p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mocha)] ${
                    isSelected
                      ? "border-[var(--mocha)] bg-[var(--mocha-muted)]"
                      : "border-[var(--oat)] bg-white hover:border-[var(--mocha-light)] hover:shadow-[0_8px_24px_rgba(166,123,91,0.08)] disabled:cursor-not-allowed disabled:opacity-60"
                  }`}
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--warm-gray)]">
                    {sample.module}
                  </span>
                  <span className="mt-2 block text-lg font-medium text-[var(--charcoal)]">
                    {sample.title}
                  </span>
                  <span className="mt-2 block text-sm leading-6 text-[var(--warm-gray)]">
                    难度 {sample.difficulty}/5 · {sample.mistake_causes.length}{" "}
                    个错因标签
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
        </>
      )}
    </div>
  );
}

function DiagnosisResultCard({
  diagnosis,
  retainedReportNotice,
}: {
  diagnosis: DiagnosisViewModel;
  retainedReportNotice: string | null;
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
        {retainedReportNotice ? (
          <p className="rounded-[16px] bg-[var(--amber-bg)] px-4 py-3 text-sm leading-6 text-[var(--amber-text)]">
            {retainedReportNotice}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {diagnosis.knowledge_points.map((id) => (
            <Tag key={id} tone="green">
              {getKnowledgeName(id)}
            </Tag>
          ))}
          <Tag tone="amber">严重度：{severityLabels[diagnosis.severity]}</Tag>
        </div>

        {diagnosis.source === "image" ? (
          <div className="rounded-[20px] border border-[var(--oat)] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--charcoal)]">
                模型识别结果
              </p>
              <Tag
                tone={
                  diagnosis.extraction_confidence === "low" ? "amber" : "green"
                }
              >
                置信度：{getConfidenceLabel(diagnosis.extraction_confidence)}
              </Tag>
            </div>

            {diagnosis.extraction_confidence === "low" ? (
              <p className="mt-3 rounded-[16px] bg-[var(--amber-bg)] px-4 py-3 text-sm leading-6 text-[var(--amber-text)]">
                识别置信度较低，本次报告不会写入长期画像。请检查题干和学生步骤后再决定是否重试。
              </p>
            ) : null}

            {diagnosis.warnings.length > 0 ? (
              <div className="mt-3 grid gap-2">
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
          <p className="mt-3 text-sm leading-7 text-[var(--charcoal)]">
            <MathText text={diagnosis.standard_solution} />
          </p>
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

        <div className="rounded-[20px] border border-[var(--oat)] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--charcoal)]">
              学生答案与偏离点
            </p>
            <div className="flex flex-wrap gap-2">
              {diagnosis.mistake_causes.map((id) => (
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
                <MathText text={diagnosis.student_answer} />
              </p>
            </div>

            <div className="rounded-[16px] bg-[var(--oat)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--mocha)]">
                diagnosis conclusion
              </p>
              <p className="mt-3 text-sm leading-7 text-[var(--warm-gray)]">
                <MathText text={getConciseDiagnosis(diagnosis)} />
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[20px] bg-[var(--oat)] p-4">
          <p className="text-sm font-semibold text-[var(--charcoal)]">错误发生步骤</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {diagnosis.step_analysis.map((item) => (
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

function PracticeLab({
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

function ProfileInsights({
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
            本次图片识别置信度不足，诊断建议仅展示，不写入本地学生画像。
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

function ReviewPath({
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

function useHasHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
}

function subscribeToHydration(): () => void {
  return function unsubscribe(): void {
    return;
  };
}

function getClientHydrationSnapshot(): boolean {
  return true;
}

function getServerHydrationSnapshot(): boolean {
  return false;
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

function getConfidenceLabel(
  confidence: DiagnosisViewModel["extraction_confidence"],
): string {
  if (confidence === "high") {
    return "高";
  }

  if (confidence === "medium") {
    return "中";
  }

  if (confidence === "low") {
    return "低";
  }

  return "样例";
}

function getConciseDiagnosis(diagnosis: DiagnosisViewModel): string {
  if (diagnosis.mistake_causes.length === 0) {
    return diagnosis.expected_diagnosis;
  }

  return `偏离点：${diagnosis.mistake_causes.map(getMistakeName).join("、")}。`;
}
