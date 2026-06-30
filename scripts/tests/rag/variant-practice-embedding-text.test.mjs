import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const {
  buildDynamicPracticeQueryEmbeddingText,
  buildVariantPracticeEmbeddingHashInput,
  buildVariantPracticeItemEmbeddingText,
} = jiti("./src/lib/rag/variant-practice-embedding-text.ts");

const itemEmbeddingText = buildVariantPracticeItemEmbeddingText({
  question_text: "已知 $f(x)=\\ln x-ax+1$，讨论单调性。",
  search_text: "导数 单调 参数",
  knowledge_points: ["derivative"],
  section_title: "考点 2 导数与函数的单调性",
  target_skills: ["monotonicity", "parameter_range"],
  method_tags: ["monotonicity_by_derivative"],
  source_ref: { pdf_path: "private.pdf" },
  review_meta: { reviewer: "local-user" },
  tag_review_meta: { review_status: "approved" },
});

assert.equal(itemEmbeddingText.includes("题干："), true);
assert.equal(itemEmbeddingText.includes("检索文本："), true);
assert.equal(itemEmbeddingText.includes("知识点：\nderivative"), true);
assert.equal(itemEmbeddingText.includes("章节：\n考点 2 导数与函数的单调性"), true);
assert.equal(itemEmbeddingText.includes("目标能力：\nmonotonicity、parameter_range"), true);
assert.equal(itemEmbeddingText.includes("方法标签：\nmonotonicity_by_derivative"), true);
assert.equal(itemEmbeddingText.includes("private.pdf"), false);
assert.equal(itemEmbeddingText.includes("reviewer"), false);
assert.equal(itemEmbeddingText.includes("review_status"), false);

const queryEmbeddingText = buildDynamicPracticeQueryEmbeddingText({
  id: "dynamic-confirmed-image-diagnosis",
  question_text: "当前错题题干",
  knowledge_points: ["derivative"],
  section_title: "考点 2 导数与函数的单调性",
  mistake_causes: ["classification_missing"],
  target_skills: ["monotonicity"],
});

assert.equal(queryEmbeddingText.includes("当前错题：\n当前错题题干"), true);
assert.equal(queryEmbeddingText.includes("错因：\nclassification_missing"), true);
assert.equal(queryEmbeddingText.includes("练习目标：\nmonotonicity"), true);
assert.equal(queryEmbeddingText.includes("student_profile"), false);
assert.equal(queryEmbeddingText.includes("memory_delta"), false);

const hashInput = buildVariantPracticeEmbeddingHashInput({
  embedding_model: "text-embedding-3-small",
  dimensions: 1536,
  embedding_text: itemEmbeddingText,
});

assert.equal(
  hashInput,
  `text-embedding-3-small\n1536\n${itemEmbeddingText}`,
);

const sourceText = readFileSync(
  "src/lib/rag/variant-practice-embedding-text.ts",
  "utf8",
);
assert.equal(sourceText.includes("node:crypto"), false);
assert.equal(sourceText.includes("createHash"), false);

console.log("variant practice embedding text tests passed");
