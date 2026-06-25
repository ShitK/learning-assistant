// server-only: this file reads ignored local artifacts with node:fs/promises.
// Do not import it from Client Components.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createVariantPracticeProductViewModel,
  type ProductVariantPractice,
} from "@/lib/rag/variant-practice-product-view-model";

const defaultRecommendationsPath = "artifacts/rag/variant-practice-agent/recommendations.json";

export async function readVariantPracticeProductRecommendations({
  filePath = defaultRecommendationsPath,
  expectedQueryId = "demo-derivative-tangent-slope",
}: {
  filePath?: string;
  expectedQueryId?: string;
} = {}): Promise<ProductVariantPractice | null> {
  try {
    const rawText = await readFile(resolve(filePath), "utf8");
    const parsed: unknown = JSON.parse(rawText);
    return createVariantPracticeProductViewModel(parsed, { expectedQueryId });
  } catch {
    return null;
  }
}
