import { isRecord } from "@/lib/shared/utils";
import type { ProviderFailureKind } from "@/lib/shared/provider-error";

export interface GlmOcrLayoutBlock {
  index: number;
  label: string;
  content: string;
  bbox_2d?: number[];
}

export interface GlmOcrParsedContent {
  markdown: string;
  layout_blocks: GlmOcrLayoutBlock[];
  warnings: string[];
}

export type GlmOcrParseResult =
  | { ok: true; value: GlmOcrParsedContent }
  | {
      ok: false;
      failure_kind: ProviderFailureKind;
      safe_error_message?: string;
    };

export function parseGlmOcrResponse(value: unknown): GlmOcrParseResult {
  if (!isRecord(value)) {
    return { ok: false, failure_kind: "empty_text_content" };
  }

  const safeErrorMessage = extractSafeErrorMessage(value.error);
  if (safeErrorMessage) {
    return {
      ok: false,
      failure_kind: "http_error",
      safe_error_message: safeErrorMessage,
    };
  }

  const layoutBlocks = parseLayoutBlocks(value.layout_details);
  const markdown =
    typeof value.md_results === "string" ? value.md_results.trim() : "";
  if (markdown.length > 0) {
    return {
      ok: true,
      value: {
        markdown,
        layout_blocks: layoutBlocks,
        warnings: [],
      },
    };
  }

  const layoutText = layoutBlocks
    .map((block) => block.content.trim())
    .filter((content) => content.length > 0)
    .join("\n")
    .trim();

  if (layoutText.length === 0) {
    return { ok: false, failure_kind: "empty_text_content" };
  }

  return {
    ok: true,
    value: {
      markdown: layoutText,
      layout_blocks: layoutBlocks,
      warnings: ["GLM-OCR 未返回 md_results，已使用 layout_details 文本拼接。"],
    },
  };
}

function parseLayoutBlocks(value: unknown): GlmOcrLayoutBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((page) => (Array.isArray(page) ? page : []))
    .map(parseLayoutBlock)
    .filter((block): block is GlmOcrLayoutBlock => block !== null)
    .sort((left, right) => left.index - right.index);
}

function parseLayoutBlock(value: unknown): GlmOcrLayoutBlock | null {
  if (!isRecord(value)) {
    return null;
  }

  const content = typeof value.content === "string" ? value.content.trim() : "";
  const index =
    typeof value.index === "number" ? value.index : Number.MAX_SAFE_INTEGER;
  const label = typeof value.label === "string" ? value.label.trim() : "unknown";
  const bbox = Array.isArray(value.bbox_2d)
    ? value.bbox_2d.filter((item): item is number => typeof item === "number")
    : undefined;

  return {
    index,
    label: label || "unknown",
    content,
    ...(bbox && bbox.length === 4 ? { bbox_2d: bbox } : {}),
  };
}

function extractSafeErrorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const code = typeof value.code === "string" ? value.code.trim() : "";
  const message = typeof value.message === "string" ? value.message.trim() : "";
  const combined = [code, message].filter(Boolean).join(": ");

  return combined.length > 0 ? combined.slice(0, 160) : undefined;
}
