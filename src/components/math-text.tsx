import katex from "katex";
import type { ReactElement, ReactNode } from "react";

interface MathTextProps {
  text: string;
  className?: string;
}

interface TextPart {
  kind: "text";
  value: string;
}

interface MathPart {
  kind: "math";
  value: string;
  displayMode: boolean;
}

type MathTextPart = TextPart | MathPart;

export function MathText({ text, className = "" }: MathTextProps): ReactElement {
  const parts = parseMathText(text);

  return (
    <span className={`math-text ${className}`}>
      {parts.map((part, index) => renderPart(part, index))}
    </span>
  );
}

function renderPart(part: MathTextPart, index: number): ReactNode {
  if (part.kind === "text") {
    return <span key={index}>{part.value}</span>;
  }

  // P0 只渲染本地受信 mock 文本；P1 接入用户/模型输入前应增加 HTML sanitize。
  const html = katex.renderToString(part.value, {
    displayMode: part.displayMode,
    strict: "ignore",
    throwOnError: false,
    trust: false,
  });

  return (
    <span
      key={index}
      className={
        part.displayMode
          ? "my-3 block overflow-x-auto"
          : "inline-block max-w-full overflow-x-auto align-baseline"
      }
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function parseMathText(text: string): MathTextPart[] {
  const parts: MathTextPart[] = [];
  const mathPattern = /(?<!\\)(\$\$?)([\s\S]+?)(?<!\\)\1/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = mathPattern.exec(text)) !== null) {
    if (isLikelyCurrencyAmount(match)) {
      continue;
    }

    if (match.index > cursor) {
      parts.push({ kind: "text", value: text.slice(cursor, match.index) });
    }

    parts.push({
      kind: "math",
      value: match[2],
      displayMode: match[1] === "$$",
    });

    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    parts.push({ kind: "text", value: text.slice(cursor) });
  }

  return parts;
}

function isLikelyCurrencyAmount(match: RegExpExecArray): boolean {
  return match[1] === "$" && /^\d/.test(match[2]);
}
