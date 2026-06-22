import assert from "node:assert/strict";

import {
  buildPracticeCorpus,
  validateReviewedPracticeSeed,
} from "../../rag/practice-corpus-core.mjs";

const seed = {
  exported_at: "2026-06-22T09:34:11.902Z",
  source_candidate_file: "artifacts/rag/mineru-candidate-mapper/candidate_questions.json",
  source_file: "/tmp/source.pdf",
  mineru_json_file: "artifacts/rag/MinerU-test/source.json",
  approved_count: 2,
  items: [
    {
      id: "candidate-1",
      candidate_id: "candidate-1",
      review_status: "reviewed",
      reviewer_note: "修正了根号",
      question_text: "1. 已知 $f(x)=\\sqrt{x}$，求导数.",
      original_question_text: "1. 已知 $f(x)=x$，求导数.",
      has_manual_correction: true,
      solution_outline: null,
      mistake_causes: [],
      knowledge_points: ["导数", "考点 1 导数的概念"],
      difficulty: null,
      source_ref: {
        pdf_page_index: 1,
        book_page_label: null,
        side: "full",
        block_start_index: 11,
        block_start_bbox: [1, 2, 3, 4],
        block_end_pdf_page_index: 1,
        block_end_index: 12,
        block_end_bbox: [1, 5, 3, 8],
        section_title: "考点 1 导数的概念",
        crop_image_path: null,
      },
      original_extraction_confidence: "high",
      original_warnings: [],
    },
    {
      id: "candidate-2",
      candidate_id: "candidate-2",
      review_status: "needs_fix",
      reviewer_note: "依赖图像",
      question_text: "2. 如图所示...",
      original_question_text: "2. 如图所示...",
      has_manual_correction: false,
      solution_outline: null,
      mistake_causes: [],
      knowledge_points: ["导数"],
      difficulty: 3,
      variant_level: "same_pattern",
      source_ref: {
        pdf_page_index: 2,
        section_title: "图像题",
      },
      original_extraction_confidence: "medium",
      original_warnings: ["missing_image"],
    },
  ],
};

{
  const result = validateReviewedPracticeSeed(seed);
  assert.equal(result.ok, true);

  const invalid = validateReviewedPracticeSeed({ items: "bad" });
  assert.equal(invalid.ok, false);
  assert.equal(
    invalid.errors.some((error) => error.includes("items must be an array")),
    true,
  );

  const invalidItem = structuredClone(seed);
  invalidItem.items[0].candidate_id = 123;
  invalidItem.items[0].question_text = "   ";
  const invalidItemResult = validateReviewedPracticeSeed(invalidItem);
  assert.equal(invalidItemResult.ok, false);
  assert.equal(
    invalidItemResult.errors.some((error) =>
      error.includes("item[0].candidate_id must be a string"),
    ),
    true,
  );
  assert.equal(
    invalidItemResult.errors.some((error) =>
      error.includes("item[0].question_text must be a non-empty string"),
    ),
    true,
  );
}

{
  const corpus = buildPracticeCorpus({
    seed,
    sourceSeedFile: "artifacts/rag/reviewed_practice_seed.json",
    generatedAt: "2026-06-22T10:00:00.000Z",
  });

  assert.equal(corpus.corpus_version, "practice-corpus-v0");
  assert.equal(corpus.generated_at, "2026-06-22T10:00:00.000Z");
  assert.equal(corpus.source_seed_file, "artifacts/rag/reviewed_practice_seed.json");
  assert.equal(corpus.source_seed_exported_at, "2026-06-22T09:34:11.902Z");
  assert.equal(corpus.item_count, 1);
  assert.equal(corpus.items.length, 1);

  const item = corpus.items[0];
  assert.equal(item.id, "practice-candidate-1");
  assert.equal(item.source_candidate_id, "candidate-1");
  assert.equal(item.question_text, seed.items[0].question_text);
  assert.equal(item.search_text.includes(seed.items[0].question_text), true);
  assert.equal(item.search_text.includes("导数"), true);
  assert.equal(item.search_text.includes("考点 1 导数的概念"), true);
  assert.deepEqual(item.knowledge_points, ["derivative"]);
  assert.equal(item.section_title, "考点 1 导数的概念");
  assert.equal(item.difficulty, null);
  assert.deepEqual(item.source_ref, seed.items[0].source_ref);
  assert.equal(item.review_meta.reviewed_seed_item_id, "candidate-1");
  assert.equal(item.review_meta.review_status, "reviewed");
  assert.equal(item.review_meta.reviewer_note, "修正了根号");
  assert.equal(item.review_meta.has_manual_correction, true);
  assert.equal(item.review_meta.original_question_text, seed.items[0].original_question_text);
  assert.deepEqual(item.review_meta.seed_knowledge_points, [
    "导数",
    "考点 1 导数的概念",
  ]);
  assert.equal(item.review_meta.original_extraction_confidence, "high");
  assert.deepEqual(item.review_meta.original_warnings, []);
  assert.equal("variant_level" in item, false);
}

{
  const blankQuestionSeed = structuredClone(seed);
  blankQuestionSeed.items.push({
    ...structuredClone(seed.items[0]),
    id: "candidate-blank",
    candidate_id: "candidate-blank",
    review_status: "reviewed",
    question_text: "   ",
  });
  const corpus = buildPracticeCorpus({
    seed: blankQuestionSeed,
    sourceSeedFile: "seed.json",
    generatedAt: "2026-06-22T10:00:00.000Z",
  });
  assert.equal(corpus.items.some((item) => item.source_candidate_id === "candidate-blank"), false);
}

{
  const numericDifficultySeed = structuredClone(seed);
  numericDifficultySeed.items[0].difficulty = 4;
  const corpus = buildPracticeCorpus({
    seed: numericDifficultySeed,
    sourceSeedFile: "seed.json",
    generatedAt: "2026-06-22T10:00:00.000Z",
  });
  assert.equal(corpus.items[0].difficulty, 4);
}

{
  const lowDifficultySeed = structuredClone(seed);
  lowDifficultySeed.items[0].difficulty = 0;
  const lowCorpus = buildPracticeCorpus({
    seed: lowDifficultySeed,
    sourceSeedFile: "seed.json",
    generatedAt: "2026-06-22T10:00:00.000Z",
  });
  assert.equal(lowCorpus.items[0].difficulty, null);

  const highDifficultySeed = structuredClone(seed);
  highDifficultySeed.items[0].difficulty = 6;
  const highCorpus = buildPracticeCorpus({
    seed: highDifficultySeed,
    sourceSeedFile: "seed.json",
    generatedAt: "2026-06-22T10:00:00.000Z",
  });
  assert.equal(highCorpus.items[0].difficulty, null);
}

{
  const missingSectionSeed = structuredClone(seed);
  delete missingSectionSeed.items[0].source_ref.section_title;
  const corpus = buildPracticeCorpus({
    seed: missingSectionSeed,
    sourceSeedFile: "seed.json",
    generatedAt: "2026-06-22T10:00:00.000Z",
  });
  assert.equal(corpus.items[0].section_title, null);
  assert.equal(corpus.items[0].search_text.includes(seed.items[0].question_text), true);
  assert.equal(corpus.items[0].search_text.includes("导数"), true);
}

{
  const missingSourceRefSeed = structuredClone(seed);
  delete missingSourceRefSeed.items[0].source_ref;
  const corpus = buildPracticeCorpus({
    seed: missingSourceRefSeed,
    sourceSeedFile: "seed.json",
    generatedAt: "2026-06-22T10:00:00.000Z",
  });
  assert.equal(corpus.items[0].section_title, null);
  assert.equal(corpus.items[0].source_ref, null);
}

console.log("practice corpus core tests passed");
