"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactElement } from "react";
import { MistakeBookPanel } from "@/components/mistake-book-panel";
import { AgentTimeline } from "@/components/workbench/agent-timeline";
import { DiagnosisResultCard } from "@/components/workbench/diagnosis-result-card";
import { HeaderBar } from "@/components/workbench/header-bar";
import { MistakeInputCard } from "@/components/workbench/mistake-input-card";
import { PracticeLab } from "@/components/workbench/practice-lab";
import { ProfileInsights } from "@/components/workbench/profile-insights";
import { ReviewPath } from "@/components/workbench/review-path";
import type {
  ConfirmedDiagnosisOptions,
  DiagnosisMode,
  ProfilePreview,
} from "@/components/workbench/workbench-types";
import {
  demoStudentContext,
  demoStudentProfile,
  mistakeHistory,
  sampleDiagnoses,
} from "@/data/mathtrace-demo";
import {
  clearStoredStudentProfile,
  readStoredStudentProfile,
  writeStoredStudentProfile,
} from "@/lib/demo/demo-state";
import {
  requestConfirmedImageDiagnosis,
  requestImageExtractionReview,
  requestSampleDiagnosis,
  shouldPersistDiagnoseProfile,
} from "@/lib/diagnosis/diagnose-client";
import { requestDynamicVariantPractice } from "@/lib/rag/dynamic-variant-practice-client";
import {
  deleteMistakeBookItem,
  requestMistakeBookItems,
} from "@/lib/mistake-book/mistake-book-client";
import {
  DATABASE_NOT_CONFIGURED_WARNING,
  DATABASE_WRITE_FAILED_WARNING,
  DUPLICATE_MISTAKE_BOOK_ITEM_WARNING,
  PROFILE_SYNC_FAILED_WARNING,
} from "@/lib/shared/persistence-warnings";
import { requestCloudStudentProfile } from "@/lib/student-profile/student-profile-client";
import { requestStudentProfileEvidence } from "@/lib/student-profile/student-profile-evidence-client";
import {
  canConfirmEditableExtractionDraft,
  createEditableExtractionDraft,
  createExtractionReviewRetainedReportNotice,
  createFollowUpDraftFromChoice,
  createImageDiagnosisViewModel,
  createRetainedReportNotice,
  createSampleDiagnosisViewModel,
  createVisionExtractionDraftFromEditableDraft,
} from "@/lib/diagnosis/diagnosis-view-model";
import { parseConfirmedExtractionDraft } from "@/lib/image-diagnosis/image-confirmation";
import type {
  SampleDiagnosis,
  SampleQuestionId,
  StudentProfile,
} from "@/data/mathtrace-demo";
import type {
  DiagnosisViewModel,
  EditableExtractionDraft,
} from "@/lib/diagnosis/diagnosis-view-model";
import type {
  DiagnoseImageSuccessResponse,
  FollowUpAnswerDraft,
} from "@/lib/diagnosis/diagnose-api";
import type { MistakeBookResponse } from "@/lib/mistake-book/mistake-book-client";
import type { PreparedImageUpload } from "@/lib/image-diagnosis/image-upload-client";
import type { StudentProfileEvidenceSummary } from "@/lib/student-profile/student-profile-evidence-service";
import type { ProductVariantPractice } from "@/lib/rag/variant-practice-product-view-model";
import { DEFAULT_VARIANT_PRACTICE_SAMPLE_ID } from "@/lib/rag/variant-practice-demo-config";

const DEFAULT_SAMPLE_ID: SampleQuestionId = DEFAULT_VARIANT_PRACTICE_SAMPLE_ID;
const cloudProfileStaleWarnings: readonly string[] = [
  PROFILE_SYNC_FAILED_WARNING,
  DATABASE_WRITE_FAILED_WARNING,
  DATABASE_NOT_CONFIGURED_WARNING,
];

type MistakeBookPanelStatus = "loading" | "ready" | "error";

export function MathTraceWorkbench({
  initialVariantPractice = null,
}: {
  initialVariantPractice?: ProductVariantPractice | null;
}): ReactElement {
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
  const [selectedFollowUpChoiceId, setSelectedFollowUpChoiceId] = useState<
    string | null
  >(null);
  const [followUpCustomText, setFollowUpCustomText] = useState("");
  const [pendingFollowUpAnswer, setPendingFollowUpAnswer] =
    useState<FollowUpAnswerDraft | null>(null);
  const [diagnosisView, setDiagnosisView] = useState<DiagnosisViewModel>(() =>
    createSampleDiagnosisViewModel(selectedSample),
  );
  const [isCurrentConfirmedImageReport, setIsCurrentConfirmedImageReport] =
    useState(false);
  const [sessionStudentProfile, setSessionStudentProfile] =
    useState<StudentProfile | null>(null);
  const [studentProfileEvidence, setStudentProfileEvidence] =
    useState<StudentProfileEvidenceSummary | null>(null);
  const [dynamicVariantPractice, setDynamicVariantPractice] =
    useState<ProductVariantPractice | null>(null);
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
  const [mistakeBookStatus, setMistakeBookStatus] =
    useState<MistakeBookPanelStatus>("loading");
  const [mistakeBookResponse, setMistakeBookResponse] =
    useState<MistakeBookResponse | null>(null);
  const [mistakeBookErrorMessage, setMistakeBookErrorMessage] = useState<
    string | null
  >(null);
  const [deletingMistakeBookItemId, setDeletingMistakeBookItemId] = useState<
    string | null
  >(null);
  const isDiagnosisRequestLockedRef = useRef(false);
  const cloudProfileRefreshRequestIdRef = useRef(0);
  const studentProfileEvidenceRefreshRequestIdRef = useRef(0);
  const dynamicVariantPracticeRequestIdRef = useRef(0);
  const isTimelineRunning =
    isTimelineAnimating && completedStepCount < diagnosisView.steps.length;
  const isDiagnosing = isRequestPending || isTimelineRunning;
  const visibleVariantPractice =
    isCurrentConfirmedImageReport && diagnosisView.source === "image"
      ? dynamicVariantPractice
      : diagnosisMode === "sample" && diagnosisView.id === DEFAULT_SAMPLE_ID
        ? initialVariantPractice
        : null;

  const refreshMistakeBook = useCallback(async (): Promise<void> => {
    setMistakeBookStatus("loading");
    setMistakeBookErrorMessage(null);

    try {
      const response = await requestMistakeBookItems({
        fetcher: window.fetch.bind(window),
        student_id: "demo_student_001",
        limit: 5,
      });
      setMistakeBookResponse(response);
      setMistakeBookStatus("ready");
    } catch (error) {
      setMistakeBookStatus("error");
      setMistakeBookErrorMessage(
        error instanceof Error ? error.message : "错题本暂时读取失败。",
      );
    }
  }, []);

  const refreshCloudStudentProfile = useCallback(async (): Promise<void> => {
    if (!hasHydrated) {
      return;
    }

    const cloudProfileRefreshRequestId =
      ++cloudProfileRefreshRequestIdRef.current;

    try {
      const cloudProfile = await requestCloudStudentProfile();
      if (
        cloudProfileRefreshRequestId !== cloudProfileRefreshRequestIdRef.current
      ) {
        return;
      }

      if (cloudProfile.profile) {
        setSessionStudentProfile(cloudProfile.profile);
        writeStoredStudentProfile(window.localStorage, cloudProfile.profile);
      }
    } catch {
      // Demo fallback remains localStorage/demoStudentProfile; cloud recovery is best-effort.
    }
  }, [hasHydrated]);

  const refreshStudentProfileEvidence = useCallback(async (): Promise<void> => {
    if (!hasHydrated) {
      return;
    }

    const evidenceRefreshRequestId =
      ++studentProfileEvidenceRefreshRequestIdRef.current;

    try {
      const evidence = await requestStudentProfileEvidence();
      if (
        evidenceRefreshRequestId !==
        studentProfileEvidenceRefreshRequestIdRef.current
      ) {
        return;
      }

      setStudentProfileEvidence(evidence.evidence);
    } catch {
      if (
        evidenceRefreshRequestId !==
        studentProfileEvidenceRefreshRequestIdRef.current
      ) {
        return;
      }

      setStudentProfileEvidence(null);
    }
  }, [hasHydrated]);

  const refreshDynamicVariantPractice = useCallback(
    async (diagnosis: DiagnoseImageSuccessResponse): Promise<void> => {
      const requestId = ++dynamicVariantPracticeRequestIdRef.current;
      const variantPractice = await requestDynamicVariantPractice({
        fetcher: window.fetch.bind(window),
        diagnosis,
      });

      if (requestId !== dynamicVariantPracticeRequestIdRef.current) {
        return;
      }

      setDynamicVariantPractice(variantPractice);
    },
    [],
  );

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void refreshMistakeBook();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [hasHydrated, refreshMistakeBook]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void refreshCloudStudentProfile();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [hasHydrated, refreshCloudStudentProfile]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void refreshStudentProfileEvidence();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [hasHydrated, refreshStudentProfileEvidence]);

  const handleDeleteMistakeBookItem = useCallback(
    async (itemId: string): Promise<void> => {
      if (deletingMistakeBookItemId !== null) {
        return;
      }

      setDeletingMistakeBookItemId(itemId);
      setMistakeBookErrorMessage(null);

      try {
        const deleteResult = await deleteMistakeBookItem({
          fetcher: window.fetch.bind(window),
          student_id: "demo_student_001",
          item_id: itemId,
        });
        await refreshMistakeBook();
        if (deleteResult.profile_sync_status === "synced") {
          await refreshStudentProfileEvidence();
          await refreshCloudStudentProfile();
        }
      } catch (error) {
        setMistakeBookStatus("error");
        setMistakeBookErrorMessage(
          error instanceof Error ? error.message : "错题本删除失败。",
        );
      } finally {
        setDeletingMistakeBookItemId(null);
      }
    },
    [
      deletingMistakeBookItemId,
      refreshCloudStudentProfile,
      refreshMistakeBook,
      refreshStudentProfileEvidence,
    ],
  );

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
    clearDynamicVariantPractice();
    const nextSample = getSampleById(sampleId);
    setSelectedSampleId(sampleId);
    setDiagnosisMode("sample");
    setDiagnosisView(createSampleDiagnosisViewModel(nextSample));
    setIsCurrentConfirmedImageReport(false);
    setEditableExtractionDraft(null);
    resetFollowUpState();
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

    clearDynamicVariantPractice();
    setDiagnosisMode(nextMode);
    setEditableExtractionDraft(null);
    resetFollowUpState();
    setApiErrorMessage(null);
    setRetainedReportNotice(null);
    setImageUploadErrorMessage(null);
    setIsTimelineAnimating(false);

    if (nextMode === "sample") {
      const nextSample = getSampleById(selectedSampleId);
      setDiagnosisView(createSampleDiagnosisViewModel(nextSample));
      setIsCurrentConfirmedImageReport(false);
      setProfilePreview(null);
      setCompletedStepCount(nextSample.steps.length);
    }
  }

  function handleImagePrepareStart(): void {
    clearDynamicVariantPractice();
    setIsImagePreparing(true);
    setIsCurrentConfirmedImageReport(false);
    setEditableExtractionDraft(null);
    resetFollowUpState();
    setImageUploadErrorMessage(null);
    setApiErrorMessage(null);
    setRetainedReportNotice(null);
  }

  function handleImagePrepared(image: PreparedImageUpload): void {
    clearDynamicVariantPractice();
    setSelectedImage(image);
    setIsCurrentConfirmedImageReport(false);
    setEditableExtractionDraft(null);
    resetFollowUpState();
    setIsImagePreparing(false);
    setImageUploadErrorMessage(null);
  }

  function handleImagePrepareError(message: string): void {
    clearDynamicVariantPractice();
    setSelectedImage(null);
    setIsCurrentConfirmedImageReport(false);
    setEditableExtractionDraft(null);
    resetFollowUpState();
    setIsImagePreparing(false);
    setImageUploadErrorMessage(message);
  }

  function handleClearImage(): void {
    if (isDiagnosing) {
      return;
    }

    clearDynamicVariantPractice();
    setSelectedImage(null);
    setIsCurrentConfirmedImageReport(false);
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
    setPendingFollowUpAnswer(null);
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

  function handleSelectFollowUpChoice(choiceId: string): void {
    setSelectedFollowUpChoiceId(choiceId);
    setPendingFollowUpAnswer(null);
    setApiErrorMessage(null);
  }

  function handleUpdateFollowUpCustomText(text: string): void {
    setFollowUpCustomText(text);
    setPendingFollowUpAnswer(null);
    setApiErrorMessage(null);
  }

  function handleSkipFollowUp(): void {
    if (
      isDiagnosing ||
      isImagePreparing ||
      isDiagnosisRequestLockedRef.current ||
      editableExtractionDraft === null
    ) {
      return;
    }

    void requestConfirmedDiagnosis(editableExtractionDraft, {
      confirmation_action: "skip_follow_up",
    });
  }

  function handleSubmitFollowUp(): void {
    if (
      isDiagnosing ||
      isImagePreparing ||
      isDiagnosisRequestLockedRef.current ||
      editableExtractionDraft === null ||
      selectedFollowUpChoiceId === null
    ) {
      return;
    }

    const followUpAnswer = createFollowUpDraftFromChoice(
      selectedFollowUpChoiceId,
      followUpCustomText,
    );
    if (
      followUpAnswer.selected_stuck_point_id === null &&
      followUpAnswer.custom_text === null
    ) {
      setApiErrorMessage("请选择卡点或输入一句话。");
      return;
    }

    void requestConfirmedDiagnosis(editableExtractionDraft, {
      confirmation_action: "submit_stuck_point",
      follow_up_answer: followUpAnswer,
    });
  }

  function handleConfirmFollowUpAnalysis(): void {
    if (
      isDiagnosing ||
      isImagePreparing ||
      isDiagnosisRequestLockedRef.current ||
      editableExtractionDraft === null ||
      pendingFollowUpAnswer === null
    ) {
      return;
    }

    void requestConfirmedDiagnosis(editableExtractionDraft, {
      confirmation_action: "confirm_stuck_point_analysis",
      follow_up_answer: pendingFollowUpAnswer,
    });
  }

  function resetFollowUpState(): void {
    setSelectedFollowUpChoiceId(null);
    setFollowUpCustomText("");
    setPendingFollowUpAnswer(null);
  }

  function clearDynamicVariantPractice(): void {
    dynamicVariantPracticeRequestIdRef.current += 1;
    setDynamicVariantPractice(null);
  }

  function handleResetProfile(): void {
    if (isDiagnosing) {
      return;
    }

    cloudProfileRefreshRequestIdRef.current += 1;
    studentProfileEvidenceRefreshRequestIdRef.current += 1;
    setStudentProfileEvidence(null);
    // 本地重置只清理浏览器状态；不删除云端画像事件或当前画像快照。
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
    setIsCurrentConfirmedImageReport(false);
    setEditableExtractionDraft(null);
    setCompletedStepCount(0);
    setIsTimelineAnimating(true);
    setIsRequestPending(true);
    clearDynamicVariantPractice();

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
          diagnosis.warnings,
        );
        setDiagnosisView(nextView);
        setIsCurrentConfirmedImageReport(false);
        setRetainedReportNotice(null);
        if (!hasDuplicateMistakeBookItemWarning(diagnosis.warnings)) {
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
        await refreshMistakeBook();
        if (shouldRefreshCloudStudentProfileAfterDiagnosis(diagnosis.warnings)) {
          await refreshStudentProfileEvidence();
          await refreshCloudStudentProfile();
        }
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
    options: ConfirmedDiagnosisOptions = {},
  ): Promise<void> {
    if (isDiagnosisRequestLockedRef.current) {
      return;
    }

    const confirmationAction =
      options.confirmation_action ?? "diagnose_from_student_work";
    const confirmedExtractionDraft =
      createVisionExtractionDraftFromEditableDraft(draft);
    const parsedDraft =
      confirmationAction === "diagnose_from_student_work"
        ? parseConfirmedExtractionDraft(confirmedExtractionDraft)
        : { ok: true as const, value: confirmedExtractionDraft };

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
    clearDynamicVariantPractice();

    try {
      const diagnosis = await requestConfirmedImageDiagnosis({
        fetcher: window.fetch.bind(window),
        confirmation_token: draft.confirmation_token,
        confirmation_action: confirmationAction,
        follow_up_answer: options.follow_up_answer,
        confirmed_extraction: parsedDraft.value,
        student_profile: profileBeforeDiagnosis,
        mistake_history: mistakeHistory,
      });
      const nextView = createImageDiagnosisViewModel(diagnosis);
      setDiagnosisView(nextView);
      setIsCurrentConfirmedImageReport(true);
      void refreshDynamicVariantPractice(diagnosis);
      if (confirmationAction === "submit_stuck_point") {
        setPendingFollowUpAnswer(options.follow_up_answer ?? null);
      } else {
        setEditableExtractionDraft(null);
        resetFollowUpState();
      }
      setRetainedReportNotice(null);

      if (
        shouldPersistDiagnoseProfile(diagnosis) &&
        !hasDuplicateMistakeBookItemWarning(diagnosis.warnings)
      ) {
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
      await refreshMistakeBook();
      if (shouldRefreshCloudStudentProfileAfterDiagnosis(diagnosis.warnings)) {
        await refreshStudentProfileEvidence();
        await refreshCloudStudentProfile();
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
              selectedFollowUpChoiceId={selectedFollowUpChoiceId}
              followUpCustomText={followUpCustomText}
              pendingFollowUpAnswer={pendingFollowUpAnswer}
              isDiagnosing={isDiagnosing}
              isImagePreparing={isImagePreparing}
              apiErrorMessage={apiErrorMessage}
              imageUploadErrorMessage={imageUploadErrorMessage}
              onSelectMode={handleSelectMode}
              onSelectSample={handleSelectSample}
              onStartDiagnosis={handleStartDiagnosis}
              onUpdateEditableExtractionDraft={handleUpdateEditableExtractionDraft}
              onConfirmExtraction={handleConfirmExtraction}
              onSelectFollowUpChoice={handleSelectFollowUpChoice}
              onUpdateFollowUpCustomText={handleUpdateFollowUpCustomText}
              onSkipFollowUp={handleSkipFollowUp}
              onSubmitFollowUp={handleSubmitFollowUp}
              onConfirmFollowUpAnalysis={handleConfirmFollowUpAnalysis}
              onImagePrepareStart={handleImagePrepareStart}
              onImagePrepared={handleImagePrepared}
              onImagePrepareError={handleImagePrepareError}
              onClearImage={handleClearImage}
            />
            <DiagnosisResultCard
              diagnosis={diagnosisView}
              retainedReportNotice={retainedReportNotice}
              isCurrentConfirmedImageReport={isCurrentConfirmedImageReport}
            />
          </div>
        </section>

        <PracticeLab
          diagnosis={diagnosisView}
          variantPractice={visibleVariantPractice}
        />

        <section className="mt-8 grid gap-8 xl:grid-cols-[0.92fr_1.08fr]">
          <ProfileInsights
            diagnosis={diagnosisView}
            beforeProfile={visibleProfilePreview.beforeProfile}
            afterProfile={visibleProfilePreview.afterProfile}
            evidence={studentProfileEvidence}
            onResetProfile={handleResetProfile}
            isResetDisabled={isDiagnosing}
          />
          <ReviewPath diagnosis={diagnosisView} />
        </section>

        <div className="mt-8">
          <MistakeBookPanel
            status={mistakeBookStatus}
            response={mistakeBookResponse}
            errorMessage={mistakeBookErrorMessage}
            deletingItemId={deletingMistakeBookItemId}
            onDeleteItem={handleDeleteMistakeBookItem}
          />
        </div>
      </div>
    </main>
  );
}

function hasDuplicateMistakeBookItemWarning(warnings: string[]): boolean {
  return warnings.includes(DUPLICATE_MISTAKE_BOOK_ITEM_WARNING);
}

function shouldRefreshCloudStudentProfileAfterDiagnosis(
  warnings: string[],
): boolean {
  return !warnings.some((warning) =>
    cloudProfileStaleWarnings.includes(warning),
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
