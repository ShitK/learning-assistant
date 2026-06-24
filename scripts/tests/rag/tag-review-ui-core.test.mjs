import assert from "node:assert/strict";

import {
  buildCompatibleReviewRecords,
  buildTagReviewAppData,
  buildTagReviewManifest,
  renderTagReviewHtml,
  renderMathTextToHtml,
  validateTagReviewQueue,
} from "../../rag/tag-review-ui-core.mjs";
import { getPracticeTagTaxonomy } from "../../rag/practice-tag-taxonomy.mjs";

const generatedAt = "2026-06-24T00:00:00.000Z";
const taxonomy = getPracticeTagTaxonomy();
const queue = {
  proposal_version: "tag-proposal-merge-v0",
  generated_at: generatedAt,
  taxonomy_id: taxonomy.taxonomy_id,
  review_queue: [
    {
      item_id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      question_text: "已知 $f'(1)=2$，求曲线在 $x=1$ 处的切线斜率。",
      section_title: "导数几何意义",
      source_ref: null,
      gate_status: "needs_review",
      review_status: "needs_review",
      recommended_review_status: "needs_fix",
      taxonomy_id: taxonomy.taxonomy_id,
      gate_reasons: ["target_skill_conflict"],
      rule_tags: {
        target_skills: ["derivative_geometric_meaning"],
        method_tags: ["derivative_definition"],
        feature_flags: ["has_choice_options"],
      },
      ai_tags: {
        target_skills: ["tangent_slope"],
        method_tags: ["tangent_slope"],
        feature_flags: ["has_choice_options"],
      },
      proposed_final_tags: {
        target_skills: ["tangent_slope"],
        method_tags: ["derivative_definition"],
        feature_flags: ["has_choice_options"],
      },
      ai_confidence: "high",
      review_origin: "auto_gate",
    },
  ],
};

{
  const arrayQueue = structuredClone(queue.review_queue);
  const validation = validateTagReviewQueue(arrayQueue, taxonomy);
  assert.equal(validation.ok, true);
  assert.equal(Array.isArray(validation.queue), true);

  const appData = buildTagReviewAppData({
    queue: validation.queue,
    taxonomy,
    queueSourceFile: "tag_review_queue.json",
    queueSourceSha256: "abc123456789",
    generatedAt,
  });

  assert.equal(appData.taxonomy.taxonomy_id, "math_derivative_v0");
  assert.equal(appData.items.length, 1);
  assert.equal(appData.items[0].question_text, queue.review_queue[0].question_text);
  assert.equal(appData.items[0].taxonomy_id, "math_derivative_v0");
  assert.equal(appData.source_queue.proposal_version, null);
  assert.equal(appData.source_queue.generated_at, null);
  assert.equal(appData.source_queue.taxonomy_id, null);
}

{
  const rendered = renderMathTextToHtml("题干 <script>alert(1)</script> 与 $f'(x)$");
  assert.equal(rendered.html.includes("<script>"), false);
  assert.equal(rendered.html.includes("katex"), true);
  assert.deepEqual(rendered.warnings, []);

  const badMath = renderMathTextToHtml("坏公式 $\\badcommand{x}$");
  assert.equal(badMath.html.includes("\\badcommand"), true);
  assert.equal(badMath.warnings.includes("math_render_failed"), true);
}

{
  const appData = buildTagReviewAppData({
    queue,
    taxonomy,
    queueSourceFile: "tag_review_queue.json",
    queueSourceSha256: "abc123456789",
    generatedAt,
  });

  assert.equal(appData.app_version, "tag-review-ui-v1");
  assert.equal(appData.storage_key, "mathtrace.tagReview.abc123456789");
  assert.equal(appData.storage_notice.includes("导出前请勿重新生成"), true);
  assert.equal(appData.taxonomy.taxonomy_id, "math_derivative_v0");
  assert.equal(appData.items.length, 1);
  assert.equal(appData.items[0].rendered_html.includes("katex"), true);
  assert.equal(appData.items[0].question_text, queue.review_queue[0].question_text);
  assert.deepEqual(appData.items[0].gate_reasons, ["target_skill_conflict"]);
  assert.deepEqual(appData.items[0].rule_tags.target_skills, ["derivative_geometric_meaning"]);
  assert.deepEqual(appData.items[0].ai_tags.target_skills, ["tangent_slope"]);
  assert.deepEqual(appData.items[0].proposed_final_tags.method_tags, ["derivative_definition"]);

  const manifest = buildTagReviewManifest(appData);
  assert.equal(manifest.app_version, "tag-review-ui-v1");
  assert.equal(manifest.queue_source_file, "tag_review_queue.json");
  assert.equal(manifest.queue_source_sha256, "abc123456789");
  assert.equal(manifest.taxonomy_id, "math_derivative_v0");
  assert.equal(manifest.item_count, 1);
}

{
  const injectionQueue = structuredClone(queue);
  injectionQueue.review_queue[0].question_text = "</script><script>alert(1)</script> $f(x)$";
  const appData = buildTagReviewAppData({
    queue: injectionQueue,
    taxonomy,
    queueSourceFile: "tag_review_queue.json",
    queueSourceSha256: "abc123456789",
    generatedAt,
  });
  const html = renderTagReviewHtml(appData, { katexCss: "", katexJs: "" });

  assert.equal(html.includes("MathTrace Tag Review"), true);
  assert.equal(html.includes("target_skills"), true);
  assert.equal(html.includes("tangent_slope"), true);
  assert.equal(html.includes("</script><script>"), false);
  assert.equal(html.includes("tag_review_records.json"), true);
  assert.equal(html.includes("导出前请勿重新生成"), true);
}

{
  const appData = buildTagReviewAppData({
    queue,
    taxonomy,
    queueSourceFile: "tag_review_queue.json",
    queueSourceSha256: "abc123456789",
    generatedAt,
  });
  const records = buildCompatibleReviewRecords({
    appData,
    reviewState: {
      "practice-candidate-1": {
        status: "approved",
        target_skills: ["tangent_slope"],
        method_tags: ["derivative_definition"],
        feature_flags: ["has_choice_options"],
        note: "确认",
      },
    },
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].item_id, "practice-candidate-1");
  assert.equal(records[0].review_status, "approved");
  assert.deepEqual(records[0].reviewed_tags.target_skills, ["tangent_slope"]);
  assert.deepEqual(records[0].reviewed_tags.method_tags, ["derivative_definition"]);
  assert.deepEqual(records[0].reviewed_tags.feature_flags, ["has_choice_options"]);
  assert.equal(records[0].review_notes, "确认");
  assert.equal(records[0].has_manual_tag_correction, true);
  assert.equal(records[0].tag_source, "human");
  assert.equal(records[0].taxonomy_id, "math_derivative_v0");
  assert.equal(records[0].review_origin, "human_review");
  assert.equal(records[0].ai_confidence, "high");
  assert.equal(records[0].rule_ai_agreement, "target_skill_conflict");
}

console.log("tag review ui core tests passed");
