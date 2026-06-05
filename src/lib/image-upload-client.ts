export const MAX_UPLOAD_IMAGE_BYTES = 1_000_000;
export const TARGET_DIAGNOSIS_IMAGE_BYTES = 600_000;
export const MAX_SOURCE_IMAGE_BYTES = 8_500_000;

export type UploadImageMimeType = "image/png" | "image/jpeg" | "image/webp";

export type ImageUploadErrorCode =
  | "invalid_type"
  | "source_too_large"
  | "read_failed"
  | "compressed_too_large";

export interface ImageFileMetadata {
  name: string;
  type: string;
  size: number;
}

export interface PreparedImageUpload {
  file_name: string;
  image_base64: string;
  image_mime_type: UploadImageMimeType;
  preview_url: string;
  byte_size: number;
  was_compressed: boolean;
}

const DATA_URL_PATTERN =
  /^data:(image\/png|image\/jpeg|image\/webp);base64,([A-Za-z0-9+/]+={0,2})$/;

export function isSupportedUploadMimeType(
  value: string,
): value is UploadImageMimeType {
  return value === "image/png" || value === "image/jpeg" || value === "image/webp";
}

export function validateImageFileMetadata(
  file: ImageFileMetadata,
): { ok: true } | { ok: false; error: ImageUploadErrorCode } {
  if (!isSupportedUploadMimeType(file.type)) {
    return { ok: false, error: "invalid_type" };
  }

  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    return { ok: false, error: "source_too_large" };
  }

  return { ok: true };
}

export function stripDataUrlPrefix(
  dataUrl: string,
):
  | { ok: true; base64: string; mime_type: UploadImageMimeType }
  | { ok: false; error: ImageUploadErrorCode } {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match || !isSupportedUploadMimeType(match[1])) {
    return { ok: false, error: "invalid_type" };
  }

  return {
    ok: true,
    base64: match[2],
    mime_type: match[1],
  };
}

export function getBase64ByteSize(base64: string): number {
  const normalized = base64.trim();
  if (normalized.length === 0) {
    return 0;
  }

  const padding = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;

  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

export function getImageUploadErrorMessage(
  code: ImageUploadErrorCode,
): string {
  if (code === "invalid_type") {
    return "请上传 PNG、JPEG 或 WebP 格式的图片。";
  }

  if (code === "source_too_large") {
    return "原图超过 8.5MB，请先裁剪题目区域后再上传。";
  }

  if (code === "compressed_too_large") {
    return "图片压缩后仍超过 600KB，请裁剪题目区域后重试。";
  }

  return "图片读取失败，请重新选择一张清晰的错题图片。";
}

export function selectUploadSizedDataUrl(
  dataUrls: string[],
  maxBytes = MAX_UPLOAD_IMAGE_BYTES,
): string | null {
  for (const dataUrl of dataUrls) {
    const parsed = stripDataUrlPrefix(dataUrl);
    if (parsed.ok && getBase64ByteSize(parsed.base64) <= maxBytes) {
      return dataUrl;
    }
  }

  return null;
}

export async function prepareImageForDiagnosis(
  file: File,
): Promise<
  | { ok: true; value: PreparedImageUpload }
  | { ok: false; error: ImageUploadErrorCode }
> {
  const validation = validateImageFileMetadata(file);
  if (!validation.ok) {
    return validation;
  }

  const originalDataUrl = await readFileAsDataUrl(file);
  if (!originalDataUrl) {
    return { ok: false, error: "read_failed" };
  }

  const originalParsed = stripDataUrlPrefix(originalDataUrl);
  if (!originalParsed.ok) {
    return originalParsed;
  }

  const originalByteSize = getBase64ByteSize(originalParsed.base64);
  if (originalByteSize <= TARGET_DIAGNOSIS_IMAGE_BYTES) {
    return {
      ok: true,
      value: {
        file_name: file.name,
        image_base64: originalParsed.base64,
        image_mime_type: originalParsed.mime_type,
        preview_url: originalDataUrl,
        byte_size: originalByteSize,
        was_compressed: false,
      },
    };
  }

  const compressedDataUrl = await compressImageToJpegDataUrl(file);
  if (!compressedDataUrl) {
    return { ok: false, error: "read_failed" };
  }

  const compressedParsed = stripDataUrlPrefix(compressedDataUrl);
  if (!compressedParsed.ok) {
    return compressedParsed;
  }

  const compressedByteSize = getBase64ByteSize(compressedParsed.base64);
  if (compressedByteSize > TARGET_DIAGNOSIS_IMAGE_BYTES) {
    return { ok: false, error: "compressed_too_large" };
  }

  return {
    ok: true,
    value: {
      file_name: file.name,
      image_base64: compressedParsed.base64,
      image_mime_type: compressedParsed.mime_type,
      preview_url: compressedDataUrl,
      byte_size: compressedByteSize,
      was_compressed: true,
    },
  };
}

function readFileAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve(typeof reader.result === "string" ? reader.result : null);
    });
    reader.addEventListener("error", () => resolve(null));
    reader.readAsDataURL(file);
  });
}

async function compressImageToJpegDataUrl(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    return null;
  }

  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return null;
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return selectUploadSizedDataUrl(
    [0.78, 0.7, 0.62, 0.54, 0.46].map((quality) => {
      return canvas.toDataURL("image/jpeg", quality);
    }),
    TARGET_DIAGNOSIS_IMAGE_BYTES,
  );
}
