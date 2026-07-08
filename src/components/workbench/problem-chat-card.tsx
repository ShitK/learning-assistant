import type { ChangeEvent, KeyboardEvent, ReactElement } from "react";
import { ImageUploadPanel } from "@/components/image-upload-panel";
import { MathText } from "@/components/math-text";
import { ProblemChatMessageBubble } from "@/components/workbench/problem-chat-message";
import {
  createEditableDraftRiskFollowUp,
  RiskFollowUpPanel,
} from "@/components/workbench/risk-follow-up-panel";
import type { DiagnosisMode } from "@/components/workbench/workbench-types";
import { sampleDiagnoses } from "@/data/mathtrace-demo";
import type { SampleDiagnosis, SampleQuestionId } from "@/data/mathtrace-demo";
import type { FollowUpAnswerDraft } from "@/lib/diagnosis/diagnose-api";
import {
  canConfirmEditableExtractionDraft,
  type EditableExtractionDraft,
} from "@/lib/diagnosis/diagnosis-view-model";
import type {
  ProblemChatMessage,
  ProblemChatStatus,
} from "@/lib/demo/problem-chat-state";
import type { PreparedImageUpload } from "@/lib/image-diagnosis/image-upload-client";

export interface ProblemChatCardProps {
  mode: DiagnosisMode;
  status: ProblemChatStatus;
  messages: ProblemChatMessage[];
  selectedSample: SampleDiagnosis;
  selectedSampleId: SampleQuestionId;
  selectedImage: PreparedImageUpload | null;
  editableExtractionDraft: EditableExtractionDraft | null;
  selectedFollowUpChoiceId: string | null;
  followUpCustomText: string;
  pendingFollowUpAnswer: FollowUpAnswerDraft | null;
  problemFollowUpQuestion: string;
  canAskProblemFollowUp: boolean;
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
  onUpdateProblemFollowUpQuestion: (text: string) => void;
  onSubmitProblemFollowUp: () => void;
}

export function ProblemChatCard(props: ProblemChatCardProps): ReactElement {
  const canStartDiagnosis =
    !props.isDiagnosing &&
    (props.mode === "sample" ||
      (props.selectedImage !== null && !props.isImagePreparing));
  const canConfirmExtraction =
    props.editableExtractionDraft !== null &&
    canConfirmEditableExtractionDraft(props.editableExtractionDraft) &&
    !props.isDiagnosing &&
    !props.isImagePreparing;
  const riskFollowUp =
    props.editableExtractionDraft === null
      ? null
      : createEditableDraftRiskFollowUp(props.editableExtractionDraft);
  const canSendProblemFollowUp =
    props.canAskProblemFollowUp &&
    props.problemFollowUpQuestion.trim().length > 0 &&
    !props.isDiagnosing;

  function handleEditableDraftChange(
    field: "question_text" | "steps_text",
    event: ChangeEvent<HTMLTextAreaElement>,
  ): void {
    if (props.editableExtractionDraft === null) {
      return;
    }

    props.onUpdateEditableExtractionDraft({
      ...props.editableExtractionDraft,
      [field]: event.target.value,
    });
  }

  function handleFollowUpKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter" && canSendProblemFollowUp) {
      props.onSubmitProblemFollowUp();
    }
  }

  return (
    <section className="mathtrace-card flex h-full min-h-[640px] flex-col overflow-hidden">
      <div className="border-b border-[var(--oat)] p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--mocha)]">
          Problem chat
        </p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--charcoal)]">
          题目会话
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--warm-gray)]">
          在这里上传图片、确认识别结果和继续追问；正式报告仍在右侧和下方卡片中展示。
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[var(--oat)] p-4">
        {props.messages.map((message, index) => (
          <ProblemChatMessageBubble
            key={`${index}-${message.kind}-${message.text}`}
            message={message}
          />
        ))}

        {props.status === "extracting_image" ||
        props.status === "diagnosing" ? (
          <div className="mr-auto max-w-[88%] rounded-[18px] bg-white px-4 py-3 text-sm leading-6 text-[var(--warm-gray)]">
            Agent 正在处理这道题...
          </div>
        ) : null}

        <div className="rounded-[18px] bg-white p-4">
          <div className="grid grid-cols-2 rounded-full bg-[var(--oat)] p-1">
            <button
              type="button"
              disabled={props.isDiagnosing}
              onClick={() => props.onSelectMode("sample")}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold ${
                props.mode === "sample"
                  ? "bg-white text-[var(--charcoal)] shadow-[0_2px_12px_rgba(166,123,91,0.08)]"
                  : "text-[var(--warm-gray)]"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              样例题
            </button>
            <button
              type="button"
              disabled={props.isDiagnosing}
              onClick={() => props.onSelectMode("image")}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold ${
                props.mode === "image"
                  ? "bg-white text-[var(--charcoal)] shadow-[0_2px_12px_rgba(166,123,91,0.08)]"
                  : "text-[var(--warm-gray)]"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              上传图片
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="min-h-12 truncate rounded-full border border-[var(--light-gray)] bg-[var(--oat)] px-4 py-3 text-sm font-medium text-[var(--warm-gray)]">
              {props.mode === "image"
                ? props.selectedImage
                  ? props.selectedImage.file_name
                  : "等待上传错题图片"
                : props.selectedSample.title}
            </div>
            <button
              type="button"
              disabled={!canStartDiagnosis}
              onClick={props.onStartDiagnosis}
              className="mathtrace-hover-lift min-h-12 cursor-pointer rounded-full bg-gradient-to-r from-[var(--mocha)] to-[var(--mocha-dark)] px-6 text-sm font-semibold text-white shadow-lg shadow-[#a67b5b]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {props.isDiagnosing
                ? "诊断中"
                : props.mode === "image"
                  ? "识别图片"
                  : "开始诊断"}
            </button>
          </div>

          {props.apiErrorMessage ? (
            <div className="mt-3 rounded-[16px] bg-[var(--amber-bg)] px-4 py-3 text-sm leading-6 text-[var(--amber-text)]">
              <p className="whitespace-pre-line">{props.apiErrorMessage}</p>
              {props.mode === "image" ? (
                <button
                  type="button"
                  disabled={props.isDiagnosing}
                  onClick={() => props.onSelectMode("sample")}
                  className="mt-3 min-h-9 rounded-full bg-white px-4 text-sm font-semibold text-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  切回样例题
                </button>
              ) : null}
            </div>
          ) : null}

          {props.mode === "image" ? (
            <ImageModeControls
              selectedImage={props.selectedImage}
              editableExtractionDraft={props.editableExtractionDraft}
              riskFollowUp={riskFollowUp}
              selectedFollowUpChoiceId={props.selectedFollowUpChoiceId}
              followUpCustomText={props.followUpCustomText}
              pendingFollowUpAnswer={props.pendingFollowUpAnswer}
              isDiagnosing={props.isDiagnosing}
              isImagePreparing={props.isImagePreparing}
              imageUploadErrorMessage={props.imageUploadErrorMessage}
              canConfirmExtraction={canConfirmExtraction}
              onImagePrepareStart={props.onImagePrepareStart}
              onImagePrepared={props.onImagePrepared}
              onImagePrepareError={props.onImagePrepareError}
              onClearImage={props.onClearImage}
              onEditableDraftChange={handleEditableDraftChange}
              onConfirmExtraction={props.onConfirmExtraction}
              onSelectFollowUpChoice={props.onSelectFollowUpChoice}
              onUpdateFollowUpCustomText={props.onUpdateFollowUpCustomText}
              onSkipFollowUp={props.onSkipFollowUp}
              onSubmitFollowUp={props.onSubmitFollowUp}
              onConfirmFollowUpAnalysis={props.onConfirmFollowUpAnalysis}
            />
          ) : (
            <SampleModeControls
              selectedSample={props.selectedSample}
              selectedSampleId={props.selectedSampleId}
              isDiagnosing={props.isDiagnosing}
              onSelectSample={props.onSelectSample}
            />
          )}
        </div>
      </div>

      <div className="border-t border-[var(--oat)] bg-white p-4">
        <div className="flex gap-2">
          <input
            value={props.problemFollowUpQuestion}
            disabled={!props.canAskProblemFollowUp || props.isDiagnosing}
            onChange={(event) =>
              props.onUpdateProblemFollowUpQuestion(event.target.value)
            }
            onKeyDown={handleFollowUpKeyDown}
            placeholder="问问这道题，比如：为什么要分类讨论？"
            className="min-h-11 min-w-0 flex-1 rounded-full border border-[var(--light-gray)] bg-[var(--oat)] px-4 text-sm text-[var(--charcoal)] outline-none focus:border-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            disabled={!canSendProblemFollowUp}
            onClick={props.onSubmitProblemFollowUp}
            className="min-h-11 rounded-full bg-[var(--deep-green)] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            发送
          </button>
        </div>
      </div>
    </section>
  );
}

function ImageModeControls({
  selectedImage,
  editableExtractionDraft,
  riskFollowUp,
  selectedFollowUpChoiceId,
  followUpCustomText,
  pendingFollowUpAnswer,
  isDiagnosing,
  isImagePreparing,
  imageUploadErrorMessage,
  canConfirmExtraction,
  onImagePrepareStart,
  onImagePrepared,
  onImagePrepareError,
  onClearImage,
  onEditableDraftChange,
  onConfirmExtraction,
  onSelectFollowUpChoice,
  onUpdateFollowUpCustomText,
  onSkipFollowUp,
  onSubmitFollowUp,
  onConfirmFollowUpAnalysis,
}: {
  selectedImage: PreparedImageUpload | null;
  editableExtractionDraft: EditableExtractionDraft | null;
  riskFollowUp: ReturnType<typeof createEditableDraftRiskFollowUp>;
  selectedFollowUpChoiceId: string | null;
  followUpCustomText: string;
  pendingFollowUpAnswer: FollowUpAnswerDraft | null;
  isDiagnosing: boolean;
  isImagePreparing: boolean;
  imageUploadErrorMessage: string | null;
  canConfirmExtraction: boolean;
  onImagePrepareStart: () => void;
  onImagePrepared: (image: PreparedImageUpload) => void;
  onImagePrepareError: (message: string) => void;
  onClearImage: () => void;
  onEditableDraftChange: (
    field: "question_text" | "steps_text",
    event: ChangeEvent<HTMLTextAreaElement>,
  ) => void;
  onConfirmExtraction: () => void;
  onSelectFollowUpChoice: (choiceId: string) => void;
  onUpdateFollowUpCustomText: (text: string) => void;
  onSkipFollowUp: () => void;
  onSubmitFollowUp: () => void;
  onConfirmFollowUpAnalysis: () => void;
}): ReactElement {
  return (
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
                  onEditableDraftChange("question_text", event)
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
                onChange={(event) => onEditableDraftChange("steps_text", event)}
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
  );
}

function SampleModeControls({
  selectedSample,
  selectedSampleId,
  isDiagnosing,
  onSelectSample,
}: {
  selectedSample: SampleDiagnosis;
  selectedSampleId: SampleQuestionId;
  isDiagnosing: boolean;
  onSelectSample: (sampleId: SampleQuestionId) => void;
}): ReactElement {
  return (
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
  );
}
