import type { ReactElement } from "react";

export function SectionHeader({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description: string;
}): ReactElement {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--mocha)]">
        {kicker}
      </p>
      <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-normal text-[var(--charcoal)] sm:text-3xl">
        {title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--warm-gray)]">
        {description}
      </p>
    </div>
  );
}
