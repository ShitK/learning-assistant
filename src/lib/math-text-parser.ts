export interface TextPart {
  kind: "text";
  value: string;
}

export interface MathPart {
  kind: "math";
  value: string;
  displayMode: boolean;
}

export type MathTextPart = TextPart | MathPart;

export function parseMathText(text: string): MathTextPart[] {
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
  return (
    match[1] === "$" &&
    /^\d/.test(match[2]) &&
    !/[=<>≤≥∈∞/()]/.test(match[2])
  );
}
