import type { ChangeEvent, ReactElement } from "react";
import { ImageUploadPanel } from "@/components/image-upload-panel";
import { MathText } from "@/components/math-text";
import { SectionHeader } from "@/components/workbench/section-header";
import {
  createEditableDraftRiskFollowUp,
  RiskFollowUpPanel,
} from "@/components/workbench/risk-follow-up-panel";
import { canConfirmEditableExtractionDraft } from "@/lib/diagnosis/diagnosis-view-model";
import { sampleDiagnoses } from "@/data/mathtrace-demo";
import type { SampleDiagnosis, SampleQuestionId } from "@/data/mathtrace-demo";
import type { FollowUpAnswerDraft } from "@/lib/diagnosis/diagnose-api";
import type { EditableExtractionDraft } from "@/lib/diagnosis/diagnosis-view-model";
import type { PreparedImageUpload } from "@/lib/image-diagnosis/image-upload-client";
import type { DiagnosisMode } from "@/components/workbench/workbench-types";

export function MistakeInputCard({
  mode,
  selectedSample,
  selectedSampleId,
  selectedImage,
  editableExtractionDraft,
  selectedFollowUpChoiceId,
  followUpCustomText,
  pendingFollowUpAnswer,
  isDiagnosing,
  isImagePreparing,
  apiErrorMessage,
  imageUploadErrorMessage,
  onSelectMode,
  onSelectSample,
  onStartDiagnosis,
  onUpdateEditableExtractionDraft,
  onConfirmExtraction,
  onSelectFollowUpChoice,
  onUpdateFollowUpCustomText,
  onSkipFollowUp,
  onSubmitFollowUp,
  onConfirmFollowUpAnalysis,
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
  selectedFollowUpChoiceId: string | null;
  followUpCustomText: string;
  pendingFollowUpAnswer: FollowUpAnswerDraft | null;
  isDiagnosing: boolean;
  isImagePreparing: boolean;
  apiErrorMessage: string | null;
  imageUploadErrorMessage: string | null;
  onSelectMode: (mode: DiagnosisMode) => void;
  onSelectSample: (sampleId: SampleQuestionId) => void;
  onStartDiagnosis: () => void;
  onUpdateEditableExtractionDraft: (draft: EditableExtractionDraft) => void;
  onConfirmExtraction: () => void;
  onSelectFollowUpChoice: (choiceId: string) => void;
  onUpdateFollowUpCustomText: (text: string) => void;
  onSkipFollowUp: () => void;
  onSubmitFollowUp: () => void;
  onConfirmFollowUpAnalysis: () => void;
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
  const riskFollowUp =
    editableExtractionDraft === null
      ? null
      : createEditableDraftRiskFollowUp(editableExtractionDraft);

  function handleEditableDraftChange(
    field: "question_text" | "steps_text",
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
              </div>

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
                    学生解题步骤
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

              </div>

              {riskFollowUp ? (
                <RiskFollowUpPanel
                  followUp={riskFollowUp}
                  selectedChoiceId={selectedFollowUpChoiceId}
                  customText={followUpCustomText}
                  pendingFollowUpAnswer={pendingFollowUpAnswer}
                  isDisabled={isDiagnosing || isImagePreparing}
                  onSelectChoice={onSelectFollowUpChoice}
                  onUpdateCustomText={onUpdateFollowUpCustomText}
                  onSkip={onSkipFollowUp}
                  onSubmit={onSubmitFollowUp}
                  onConfirm={onConfirmFollowUpAnalysis}
                />
              ) : null}

              {riskFollowUp ? null : (
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
              )}
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
