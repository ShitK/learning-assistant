export interface ParsedImageInput {
  image_base64: string;
  mime_type: SupportedImageMimeType;
  byte_size: number;
}

export type SupportedImageMimeType = "image/png" | "image/jpeg" | "image/webp";

export type ImageInputErrorCode =
  | "missing_image"
  | "invalid_image"
  | "image_too_large";

const DATA_URL_PATTERN =
  /^data:(image\/png|image\/jpeg|image\/webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const BASE64_CHARS_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export function parseImageInput(input: {
  image_base64: string | null;
  image_mime_type: unknown;
  max_bytes: number;
}): { ok: true; value: ParsedImageInput } | { ok: false; error: ImageInputErrorCode } {
  if (!input.image_base64 || input.image_base64.trim().length === 0) {
    return {
      ok: false,
      error: "missing_image",
    };
  }

  const parsed = parseBase64AndMime(input.image_base64, input.image_mime_type);
  if (!parsed) {
    return {
      ok: false,
      error: "invalid_image",
    };
  }

  const byteSize = Buffer.byteLength(Buffer.from(parsed.image_base64, "base64"));
  if (byteSize > input.max_bytes) {
    return {
      ok: false,
      error: "image_too_large",
    };
  }

  return {
    ok: true,
    value: {
      image_base64: parsed.image_base64,
      mime_type: parsed.mime_type,
      byte_size: byteSize,
    },
  };
}

function parseBase64AndMime(
  imageBase64: string,
  imageMimeType: unknown,
): { image_base64: string; mime_type: SupportedImageMimeType } | null {
  const trimmedImage = imageBase64.trim();
  const dataUrlMatch = DATA_URL_PATTERN.exec(trimmedImage);
  if (dataUrlMatch) {
    const mimeType = dataUrlMatch[1];
    const base64 = normalizeBase64(dataUrlMatch[2]);

    if (!isSupportedImageMimeType(mimeType) || !base64) {
      return null;
    }

    return {
      image_base64: base64,
      mime_type: mimeType,
    };
  }

  const normalizedBase64 = normalizeBase64(trimmedImage);
  if (!isSupportedImageMimeType(imageMimeType) || !normalizedBase64) {
    return null;
  }

  return {
    image_base64: normalizedBase64,
    mime_type: imageMimeType,
  };
}

function normalizeBase64(value: string): string | null {
  if (!BASE64_CHARS_PATTERN.test(value)) {
    return null;
  }

  const unpadded = value.replace(/=+$/, "");
  if (unpadded.length === 0 || unpadded.length % 4 === 1) {
    return null;
  }

  const paddingLength = (4 - (unpadded.length % 4)) % 4;
  return `${unpadded}${"=".repeat(paddingLength)}`;
}

function isSupportedImageMimeType(
  value: unknown,
): value is SupportedImageMimeType {
  return (
    value === "image/png" || value === "image/jpeg" || value === "image/webp"
  );
}
