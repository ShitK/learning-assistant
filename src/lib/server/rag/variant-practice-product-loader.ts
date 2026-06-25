// server-only: this file reads ignored local artifacts with node:fs/promises.
// Do not import it from Client Components.
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
  createVariantPracticeProductViewModel,
  type ProductVariantPractice,
} from "@/lib/rag/variant-practice-product-view-model";
import { DEFAULT_VARIANT_PRACTICE_QUERY_ID } from "@/lib/rag/variant-practice-demo-config";

const defaultRecommendationsPath = "artifacts/rag/variant-practice-agent/recommendations.json";

export async function readVariantPracticeProductRecommendations({
  filePath = defaultRecommendationsPath,
  expectedQueryId = DEFAULT_VARIANT_PRACTICE_QUERY_ID,
}: {
  filePath?: string;
  expectedQueryId?: string;
} = {}): Promise<ProductVariantPractice | null> {
  try {
    const absoluteFilePath = isAbsolute(filePath)
      ? filePath
      : join(/* turbopackIgnore: true */ process.cwd(), filePath);
    const rawText = await readFile(absoluteFilePath, "utf8");
    const parsed: unknown = JSON.parse(rawText);
    return createVariantPracticeProductViewModel(parsed, { expectedQueryId });
  } catch {
    return null;
  }
}
