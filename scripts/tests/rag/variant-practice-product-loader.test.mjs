import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const { readVariantPracticeProductRecommendations } = jiti(
  "./src/lib/server/rag/variant-practice-product-loader.ts",
);

const tmpRoot = mkdtempSync(join(tmpdir(), "variant-practice-product-loader-"));
const artifactPath = join(tmpRoot, "recommendations.json");

writeFileSync(
  artifactPath,
  `${JSON.stringify(
    {
      agent_version: "variant-practice-agent-v0",
      query_id: "demo-derivative-tangent-slope",
      recommendations: [
        {
          rank: 1,
          recommendation_type: "foundation",
          item_id: "internal-1",
          source_candidate_id: "candidate-1",
          question_text: "1. 已知 $f'(1)=2$，求切线斜率。",
          reason: "同章节同标签。",
          matched_dimensions: ["knowledge_point"],
          score: 42,
        },
      ],
      warnings: ["demo_fill_used"],
    },
    null,
    2,
  )}\n`,
);

const loaded = await readVariantPracticeProductRecommendations({ filePath: artifactPath });
assert.equal(loaded.items.length, 1);
assert.equal(loaded.items[0].title, "巩固题");
assert.equal(
  loaded.notice,
  "当前题库里暂时没有足够合适的综合练习，已为你补充一题相近练习。",
);

const missing = await readVariantPracticeProductRecommendations({
  filePath: join(tmpRoot, "missing.json"),
});
assert.equal(missing, null);

writeFileSync(join(tmpRoot, "bad.json"), "{");
const malformed = await readVariantPracticeProductRecommendations({
  filePath: join(tmpRoot, "bad.json"),
});
assert.equal(malformed, null);

const mismatched = await readVariantPracticeProductRecommendations({
  filePath: artifactPath,
  expectedQueryId: "other-sample",
});
assert.equal(mismatched, null);

console.log("variant practice product loader tests passed");
