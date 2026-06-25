import type { ReactElement } from "react";
import { MathTraceWorkbench } from "@/components/mathtrace-workbench";
import { readVariantPracticeProductRecommendations } from "@/lib/server/rag/variant-practice-product-loader";

export default async function Home(): Promise<ReactElement> {
  const initialVariantPractice = await readVariantPracticeProductRecommendations();
  return <MathTraceWorkbench initialVariantPractice={initialVariantPractice} />;
}
