"use client";

import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent, ReactElement } from "react";
import {
  getImageUploadErrorMessage,
  prepareImageForDiagnosis,
} from "@/lib/image-diagnosis/image-upload-client";
import type { PreparedImageUpload } from "@/lib/image-diagnosis/image-upload-client";

export interface ImageUploadPanelProps {
  selectedImage: PreparedImageUpload | null;
  isDisabled: boolean;
  isPreparing: boolean;
  errorMessage: string | null;
  onPrepareStart: () => void;
  onPrepared: (image: PreparedImageUpload) => void;
  onPrepareError: (message: string) => void;
  onClear: () => void;
}

export function ImageUploadPanel({
  selectedImage,
  isDisabled,
  isPreparing,
  errorMessage,
  onPrepareStart,
  onPrepared,
  onPrepareError,
  onClear,
}: ImageUploadPanelProps): ReactElement {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const prepareRequestIdRef = useRef(0);
  const [isDragActive, setIsDragActive] = useState(false);

  function openFileDialog(): void {
    if (!isDisabled && !isPreparing) {
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
    if (!isDisabled && !isPreparing) {
      setIsDragActive(true);
    }
  }

  function handleDragLeave(): void {
    setIsDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDragActive(false);
    if (isDisabled || isPreparing) {
      return;
    }

    const file = event.dataTransfer.files[0] ?? null;
    if (file) {
      void prepareFile(file);
    }
  }

  async function prepareFile(file: File): Promise<void> {
    const requestId = prepareRequestIdRef.current + 1;
    prepareRequestIdRef.current = requestId;
    onPrepareStart();

    try {
      const result = await prepareImageForDiagnosis(file);
      if (requestId !== prepareRequestIdRef.current) {
        return;
      }

      if (result.ok) {
        onPrepared(result.value);
        return;
      }

      onPrepareError(getImageUploadErrorMessage(result.error));
    } catch {
      if (requestId !== prepareRequestIdRef.current) {
        return;
      }

      onPrepareError(getImageUploadErrorMessage("read_failed"));
    }
  }

  const panelClassName = isDragActive
    ? "border-[var(--mocha)] bg-[var(--mocha-muted)]"
    : "border-[var(--light-gray)] bg-[var(--oat)]";

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      aria-busy={isPreparing}
      className={`rounded-[20px] border border-dashed p-4 ${panelClassName}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleInputChange}
      />

      {selectedImage ? (
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selectedImage.preview_url}
            alt="已选择的错题图片预览"
            className="aspect-[4/3] w-full rounded-[16px] border border-white bg-white object-contain"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--charcoal)]">
              {selectedImage.file_name}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--warm-gray)]">
              {(selectedImage.byte_size / 1024).toFixed(0)} KB
              {selectedImage.was_compressed ? " · 已压缩" : " · 原图可用"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isDisabled || isPreparing}
                onClick={openFileDialog}
                className="min-h-10 rounded-full border border-[var(--light-gray)] bg-white px-4 text-sm font-medium text-[var(--warm-gray)] hover:border-[var(--mocha-light)] hover:text-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                重新选择
              </button>
              <button
                type="button"
                disabled={isDisabled || isPreparing}
                onClick={onClear}
                className="min-h-10 rounded-full border border-[var(--light-gray)] bg-white px-4 text-sm font-medium text-[var(--warm-gray)] hover:border-[var(--mocha-light)] hover:text-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                移除
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={isDisabled || isPreparing}
          onClick={openFileDialog}
          className="flex min-h-28 w-full cursor-pointer flex-col items-center justify-center rounded-[16px] bg-white px-4 py-5 text-center text-sm font-medium text-[var(--warm-gray)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="text-base font-semibold text-[var(--charcoal)]">
            {isPreparing ? "正在压缩图片" : "选择或拖入错题图片"}
          </span>
          <span className="mt-2 leading-6">
            PNG / JPEG / WebP，提交前压缩到约 600KB
          </span>
        </button>
      )}

      {errorMessage ? (
        <p className="mt-3 rounded-[16px] bg-[var(--amber-bg)] px-4 py-3 text-sm leading-6 text-[var(--amber-text)]">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
