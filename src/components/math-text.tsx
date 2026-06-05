import katex from "katex";
import { parseMathText } from "@/lib/math-text-parser";
import type { ReactElement, ReactNode } from "react";
import type { MathTextPart } from "@/lib/math-text-parser";

interface MathTextProps {
  text: string;
  className?: string;
}

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
