import type { ReactElement, ReactNode } from "react";

export function Tag({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "green" | "amber" | "rust";
}): ReactElement {
  const toneClassName = {
    amber: "bg-[var(--amber-bg)] text-[var(--amber-text)]",
    green: "bg-[var(--deep-green-muted)] text-[var(--deep-green)]",
    rust: "bg-[var(--mocha-muted)] text-[var(--mocha)]",
  }[tone];

  return (
    <span className={`rounded px-2.5 py-1 text-xs font-semibold ${toneClassName}`}>
      {children}
    </span>
  );
}
