export function normalizeExtractedMathText(text: string): string {
  return transformOutsideDelimitedMath(text, normalizeLooseMathSegment);
}

function transformOutsideDelimitedMath(
  text: string,
  transform: (segment: string) => string,
): string {
  const parts: string[] = [];
  const mathPattern = /(?<!\\)(\$\$?)[\s\S]+?(?<!\\)\1/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = mathPattern.exec(text)) !== null) {
    if (match.index > cursor) {
      parts.push(transform(text.slice(cursor, match.index)));
    }

    parts.push(match[0]);
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    parts.push(transform(text.slice(cursor)));
  }

  return parts.join("");
}

function normalizeLooseMathSegment(segment: string): string {
  let normalizedSegment = replaceOutsideInlineMath(
    segment,
    /[A-Za-z][A-Za-z0-9'′]*\([^)]*\)\s*=\s*[A-Za-z0-9\\'′()+\-*/^{}\s]+/g,
    wrapLooseMath,
  );

  normalizedSegment = replaceOutsideInlineMath(
    normalizedSegment,
    /\b[A-Za-z]\s*(?:\\leq|\\geq|<=|>=|[=<>≤≥])\s*-?\d+(?:\/[A-Za-z])?\b/g,
    wrapLooseMath,
  );

  normalizedSegment = replaceOutsideInlineMath(
    normalizedSegment,
    /[A-Za-z][A-Za-z0-9'′]*\([^)]*\)/g,
    wrapLooseMath,
  );

  return replaceOutsideInlineMath(
    normalizedSegment,
    /\((?:[+\-]?\d+|[A-Za-z∞+\\]+)\s*,\s*(?:[+\-]?\d+|[A-Za-z∞+\\]+)\)/g,
    wrapLooseMath,
  );
}

function replaceOutsideInlineMath(
  text: string,
  pattern: RegExp,
  replacer: (candidate: string) => string,
): string {
  return transformOutsideDelimitedMath(text, (segment) =>
    segment.replace(pattern, replacer),
  );
}

function wrapLooseMath(candidate: string): string {
  const leadingWhitespace = candidate.match(/^\s*/)?.[0] ?? "";
  const trailingWhitespace = candidate.match(/\s*$/)?.[0] ?? "";
  const core = candidate.trim();

  if (core.length === 0) {
    return candidate;
  }

  return `${leadingWhitespace}$${normalizeLatexCore(core)}$${trailingWhitespace}`;
}

function normalizeLatexCore(text: string): string {
  return text
    .replace(/′/g, "'")
    .replace(/\bln\s*([A-Za-z(])/g, "\\ln $1")
    .replace(/\ba\s+x\b/g, "ax")
    .replace(/\ba\s+e\b/g, "ae")
    .replace(/\s+/g, " ")
    .trim();
}
