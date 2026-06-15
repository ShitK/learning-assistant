import type { ReactElement } from "react";
import type { DiagnosisMode } from "@/components/workbench/workbench-types";

export function HeaderBar({ mode }: { mode: DiagnosisMode }): ReactElement {
  return (
    <header className="mathtrace-glass sticky top-0 z-50">
      <div className="mx-auto flex min-h-16 w-full max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--mocha)] to-[var(--mocha-dark)] text-sm font-semibold text-white shadow-lg shadow-[#a67b5b]/20">
            MT
          </div>
          <div>
            <p className="text-sm font-medium leading-none tracking-wide text-[var(--charcoal)]">
              MathTrace
            </p>
            <p className="mt-1 text-xs text-[var(--warm-gray)]">
              {mode === "image" ? "image_diagnosis" : "sample_diagnosis"}
            </p>
          </div>
        </div>

        <div className="hidden items-center gap-6 text-sm text-[var(--warm-gray)] md:flex">
          <span>错因诊断</span>
          <span>长期画像</span>
          <span>7 天复习</span>
        </div>

        <div className="rounded-full bg-white px-3 py-2 text-xs font-medium text-[var(--mocha)] shadow-[0_2px_12px_rgba(166,123,91,0.05)]">
          demo_student_001
        </div>
      </div>
    </header>
  );
}

