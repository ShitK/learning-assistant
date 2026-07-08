import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { ProblemChatMessageBubble } from "@/components/workbench/problem-chat-message";
import {
  createEditableDraftRiskFollowUp,
  RiskFollowUpPanel,
} from "@/components/workbench/risk-follow-up-panel";
import type { DiagnosisMode } from "@/components/workbench/workbench-types";
import type { FollowUpAnswerDraft } from "@/lib/diagnosis/diagnose-api";
import {
  canConfirmEditableExtractionDraft,
  type EditableExtractionDraft,
} from "@/lib/diagnosis/diagnosis-view-model";
import type {
  ProblemChatMessage,
  ProblemChatStatus,
} from "@/lib/demo/problem-chat-state";
import {
  getImageUploadErrorMessage,
  prepareImageForDiagnosis,
  type PreparedImageUpload,
} from "@/lib/image-diagnosis/image-upload-client";

export interface ProblemChatCardProps {
  status: ProblemChatStatus;
  messages: ProblemChatMessage[];
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
    !props.isDiagnosing &&
    !props.isImagePreparing;
  const canSendImageForDiagnosis =
    props.selectedImage !== null &&
    props.editableExtractionDraft === null &&
    !props.isDiagnosing &&
    !props.isImagePreparing;

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

  return (
    <section className="mathtrace-card flex h-full min-h-[680px] flex-col overflow-hidden">
      <div className="border-b border-[var(--oat)] px-5 py-4 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--mocha)]">
          Problem agent
        </p>
        <h2 className="mt-1 text-xl font-semibold text-[var(--charcoal)]">
          题目 Agent
        </h2>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[var(--oat)] p-4">
        {props.messages.map((message, index) => (
          <ProblemChatMessageBubble
            key={`${index}-${message.kind}-${message.text}`}
            message={message}
          />
        ))}

        {props.status === "image_preparing" ? (
          <AgentTextBubble text="我正在读取和压缩这张图片..." />
        ) : null}

        {props.status === "extracting_image" ||
        props.status === "diagnosing" ? (
          <AgentTextBubble text="我正在识别题目并整理需要你确认的信息..." />
        ) : null}

        {props.editableExtractionDraft ? (
          <ExtractionReviewBubble
            draft={props.editableExtractionDraft}
            riskFollowUp={riskFollowUp}
            selectedFollowUpChoiceId={props.selectedFollowUpChoiceId}
            followUpCustomText={props.followUpCustomText}
            pendingFollowUpAnswer={props.pendingFollowUpAnswer}
            isDisabled={props.isDiagnosing || props.isImagePreparing}
            canConfirmExtraction={canConfirmExtraction}
            onEditableDraftChange={handleEditableDraftChange}
            onConfirmExtraction={props.onConfirmExtraction}
            onSelectFollowUpChoice={props.onSelectFollowUpChoice}
            onUpdateFollowUpCustomText={props.onUpdateFollowUpCustomText}
            onSkipFollowUp={props.onSkipFollowUp}
            onSubmitFollowUp={props.onSubmitFollowUp}
            onConfirmFollowUpAnalysis={props.onConfirmFollowUpAnalysis}
          />
        ) : null}

        {props.apiErrorMessage ? (
          <AgentTextBubble tone="error" text={props.apiErrorMessage} />
        ) : null}
      </div>

      <ProblemChatComposer
        selectedImage={props.selectedImage}
        problemFollowUpQuestion={props.problemFollowUpQuestion}
        canSendProblemFollowUp={canSendProblemFollowUp}
        canSendImageForDiagnosis={canSendImageForDiagnosis}
        canAskProblemFollowUp={props.canAskProblemFollowUp}
        isDisabled={props.isDiagnosing || props.isImagePreparing}
        isImagePreparing={props.isImagePreparing}
        imageUploadErrorMessage={props.imageUploadErrorMessage}
        onSelectMode={props.onSelectMode}
        onImagePrepareStart={props.onImagePrepareStart}
        onImagePrepared={props.onImagePrepared}
        onImagePrepareError={props.onImagePrepareError}
        onClearImage={props.onClearImage}
        onUpdateProblemFollowUpQuestion={props.onUpdateProblemFollowUpQuestion}
        onSubmitProblemFollowUp={props.onSubmitProblemFollowUp}
        onStartDiagnosis={props.onStartDiagnosis}
      />
    </section>
  );
}

function AgentTextBubble({
  text,
  tone = "default",
}: {
  text: string;
  tone?: "default" | "error";
}): ReactElement {
  const toneClassName =
    tone === "error"
      ? "bg-[var(--amber-bg)] text-[var(--amber-text)]"
      : "bg-white text-[var(--warm-gray)]";

  return (
    <div
      className={`mr-auto max-w-[88%] rounded-[18px] px-4 py-3 text-sm leading-6 ${toneClassName}`}
    >
      <p className="whitespace-pre-line break-words">{text}</p>
    </div>
  );
}

function ExtractionReviewBubble({
  draft,
  riskFollowUp,
  selectedFollowUpChoiceId,
  followUpCustomText,
  pendingFollowUpAnswer,
  isDisabled,
  canConfirmExtraction,
  onEditableDraftChange,
  onConfirmExtraction,
  onSelectFollowUpChoice,
  onUpdateFollowUpCustomText,
  onSkipFollowUp,
  onSubmitFollowUp,
  onConfirmFollowUpAnalysis,
}: {
  draft: EditableExtractionDraft;
  riskFollowUp: ReturnType<typeof createEditableDraftRiskFollowUp>;
  selectedFollowUpChoiceId: string | null;
  followUpCustomText: string;
  pendingFollowUpAnswer: FollowUpAnswerDraft | null;
  isDisabled: boolean;
  canConfirmExtraction: boolean;
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
    <div className="mr-auto w-full max-w-[98%] rounded-[20px] bg-white p-4">
      <p className="text-sm font-semibold text-[var(--charcoal)]">
        我识别到了这些内容，请先确认
      </p>

      {draft.warnings.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {draft.warnings.map((warning, index) => (
            <li
              key={`${index}-${warning}`}
              className="rounded-[14px] bg-[var(--amber-bg)] px-3 py-2 text-sm leading-6 text-[var(--amber-text)]"
            >
              {warning}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold text-[var(--mocha)]">题干</span>
          <textarea
            value={draft.question_text}
            rows={4}
            disabled={isDisabled}
            onChange={(event) => onEditableDraftChange("question_text", event)}
            className="min-h-24 resize-y rounded-[16px] border border-[var(--light-gray)] bg-[var(--oat)] px-3 py-2 text-sm leading-6 text-[var(--charcoal)] outline-none focus:border-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-semibold text-[var(--mocha)]">
            学生解题步骤
          </span>
          <textarea
            value={draft.steps_text}
            rows={4}
            disabled={isDisabled}
            onChange={(event) => onEditableDraftChange("steps_text", event)}
            className="min-h-24 resize-y rounded-[16px] border border-[var(--light-gray)] bg-[var(--oat)] px-3 py-2 text-sm leading-6 text-[var(--charcoal)] outline-none focus:border-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
      </div>

      {riskFollowUp ? (
        <RiskFollowUpPanel
          followUp={riskFollowUp}
          selectedChoiceId={selectedFollowUpChoiceId}
          customText={followUpCustomText}
          pendingFollowUpAnswer={pendingFollowUpAnswer}
          isDisabled={isDisabled}
          onSelectChoice={onSelectFollowUpChoice}
          onUpdateCustomText={onUpdateFollowUpCustomText}
          onSkip={onSkipFollowUp}
          onSubmit={onSubmitFollowUp}
          onConfirm={onConfirmFollowUpAnalysis}
        />
      ) : (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-[var(--warm-gray)]">
            确认后我会生成右侧报告；画像写入仍以服务端确认结果为准。
          </p>
          <button
            type="button"
            disabled={!canConfirmExtraction}
            onClick={onConfirmExtraction}
            className="min-h-10 rounded-full bg-[var(--deep-green)] px-5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(45,95,77,0.16)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-green)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            确认生成报告
          </button>
        </div>
      )}
    </div>
  );
}

function ProblemChatComposer({
  selectedImage,
  problemFollowUpQuestion,
  canSendProblemFollowUp,
  canSendImageForDiagnosis,
  canAskProblemFollowUp,
  isDisabled,
  isImagePreparing,
  imageUploadErrorMessage,
  onSelectMode,
  onImagePrepareStart,
  onImagePrepared,
  onImagePrepareError,
  onClearImage,
  onUpdateProblemFollowUpQuestion,
  onSubmitProblemFollowUp,
  onStartDiagnosis,
}: {
  selectedImage: PreparedImageUpload | null;
  problemFollowUpQuestion: string;
  canSendProblemFollowUp: boolean;
  canSendImageForDiagnosis: boolean;
  canAskProblemFollowUp: boolean;
  isDisabled: boolean;
  isImagePreparing: boolean;
  imageUploadErrorMessage: string | null;
  onSelectMode: (mode: DiagnosisMode) => void;
  onImagePrepareStart: () => void;
  onImagePrepared: (image: PreparedImageUpload) => void;
  onImagePrepareError: (message: string) => void;
  onClearImage: () => void;
  onUpdateProblemFollowUpQuestion: (text: string) => void;
  onSubmitProblemFollowUp: () => void;
  onStartDiagnosis: () => void;
}): ReactElement {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const prepareRequestIdRef = useRef(0);
  const [isDragActive, setIsDragActive] = useState(false);

  function openFileDialog(): void {
    if (!isDisabled) {
      inputRef.current?.click();
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (file) {
      void prepareFile(file);
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    if (!isDisabled) {
      setIsDragActive(true);
    }
  }

  function handleDragLeave(): void {
    setIsDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDragActive(false);
    if (isDisabled) {
      return;
    }

    const file = event.dataTransfer.files[0] ?? null;
    if (file) {
      void prepareFile(file);
    }
  }

  function handleComposerKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void {
    if (event.key === "Enter" && !event.shiftKey && canSendProblemFollowUp) {
      event.preventDefault();
      onSubmitProblemFollowUp();
    }
  }

  function handleSend(): void {
    if (canSendImageForDiagnosis) {
      onStartDiagnosis();
      return;
    }

    if (canSendProblemFollowUp) {
      onSubmitProblemFollowUp();
    }
  }

  async function prepareFile(file: File): Promise<void> {
    const requestId = prepareRequestIdRef.current + 1;
    prepareRequestIdRef.current = requestId;
    onSelectMode("image");
    onImagePrepareStart();

    try {
      const result = await prepareImageForDiagnosis(file);
      if (requestId !== prepareRequestIdRef.current) {
        return;
      }

      if (result.ok) {
        onImagePrepared(result.value);
        return;
      }

      onImagePrepareError(getImageUploadErrorMessage(result.error));
    } catch {
      if (requestId !== prepareRequestIdRef.current) {
        return;
      }

      onImagePrepareError(getImageUploadErrorMessage("read_failed"));
    }
  }

  const composerClassName = isDragActive
    ? "border-[var(--mocha)] bg-[var(--mocha-muted)]"
    : "border-[var(--light-gray)] bg-white";

  return (
    <div className="border-t border-[var(--oat)] bg-white p-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleInputChange}
      />

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-busy={isImagePreparing}
        className={`rounded-[22px] border p-3 transition-colors ${composerClassName}`}
      >
        {selectedImage ? (
          <div className="mb-3 w-fit rounded-[16px] bg-[var(--oat)] p-2">
            <div className="relative h-16 w-20 overflow-hidden rounded-[12px] border border-white bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedImage.preview_url}
                alt="已上传错题图片"
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                disabled={isDisabled}
                onClick={onClearImage}
                aria-label="删除已上传图片"
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs font-semibold leading-none text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                ×
              </button>
            </div>
          </div>
        ) : null}

        <textarea
          value={problemFollowUpQuestion}
          disabled={!canAskProblemFollowUp || isDisabled}
          onChange={(event) => onUpdateProblemFollowUpQuestion(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          rows={2}
          placeholder={
            canAskProblemFollowUp
              ? "继续追问这道题，比如：为什么要分类讨论？"
              : "拖入错题图片，或点击左侧 + 上传"
          }
          className="max-h-28 min-h-12 w-full resize-none bg-transparent px-1 text-sm leading-6 text-[var(--charcoal)] outline-none placeholder:text-[var(--warm-gray)] disabled:cursor-not-allowed disabled:opacity-70"
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={isDisabled}
            onClick={openFileDialog}
            aria-label="上传错题图片"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--light-gray)] bg-[var(--oat)] text-xl font-semibold text-[var(--charcoal)] hover:border-[var(--mocha-light)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            +
          </button>
          <button
            type="button"
            disabled={!canSendImageForDiagnosis && !canSendProblemFollowUp}
            onClick={handleSend}
            className="min-h-10 rounded-full bg-[var(--deep-green)] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            发送
          </button>
        </div>
      </div>

      {imageUploadErrorMessage ? (
        <p className="mt-3 rounded-[16px] bg-[var(--amber-bg)] px-4 py-3 text-sm leading-6 text-[var(--amber-text)]">
          {imageUploadErrorMessage}
        </p>
      ) : null}
    </div>
  );
}
