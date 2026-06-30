import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const {
  createDisabledVariantPracticeCorpusRepository,
  createSupabaseVariantPracticeCorpusRepository,
  normalizePgvectorQueryTimeoutMs,
} = jiti("./src/lib/persistence/variant-practice-corpus-persistence.ts");

assert.equal(normalizePgvectorQueryTimeoutMs(undefined), 10000);
assert.equal(normalizePgvectorQueryTimeoutMs("1"), 2000);
assert.equal(normalizePgvectorQueryTimeoutMs("7000"), 7000);
assert.equal(normalizePgvectorQueryTimeoutMs("30000"), 15000);
assert.equal(normalizePgvectorQueryTimeoutMs("bad"), 10000);

const disabled = createDisabledVariantPracticeCorpusRepository();
assert.equal(disabled.is_database_configured, false);
assert.deepEqual(await disabled.listEmbeddingHashes(), new Map());
await disabled.upsertItems([]);
await disabled.deactivateMissingItems([]);
assert.deepEqual(
  await disabled.matchItems({
    query_embedding: [0.1, 0.2],
    match_count: 12,
    knowledge_points: ["derivative"],
    target_skills: ["monotonicity"],
    section_title: "考点 2 导数与函数的单调性",
    timeout_ms: 10,
  }),
  [],
);

const calls = [];
const fakeClient = {
  from(table) {
    calls.push({ kind: "from", table });
    if (table !== "variant_practice_corpus_items") {
      throw new Error(`unexpected table ${table}`);
    }
    return {
      select(columns) {
        calls.push({ kind: "select", columns });
        return Object.assign(Promise.resolve({ data: [], error: null }), {
          eq(column, value) {
            calls.push({ kind: "eq", column, value });
            return Promise.resolve({
              data: [
                { id: "practice-1", embedding_hash: "hash-1", is_active: true },
              ],
              error: null,
            });
          },
        });
      },
      upsert(payload, options) {
        calls.push({ kind: "upsert", payload, options });
        return Promise.resolve({ error: null });
      },
      update(payload) {
        calls.push({ kind: "update", payload });
        return Object.assign(Promise.resolve({ error: null }), {
          not(column, operator, value) {
            calls.push({ kind: "not", column, operator, value });
            return Promise.resolve({ error: null });
          },
        });
      },
    };
  },
  rpc(name, params) {
    calls.push({ kind: "rpc", name, params });
    return Promise.resolve({
      data: [
        {
          id: "practice-1",
          source_candidate_id: "candidate-1",
          question_text: "题干",
          search_text: "检索文本",
          knowledge_points: ["derivative"],
          section_title: "考点 2 导数与函数的单调性",
          difficulty: null,
          target_skills: ["monotonicity"],
          method_tags: ["monotonicity_by_derivative"],
          feature_flags: [],
          source_ref: { pdf_page_index: 1 },
          tag_review_meta: { review_status: "approved" },
          cosine_distance: 0.12,
          metadata_score: 20,
        },
      ],
      error: null,
    });
  },
};

const repository = createSupabaseVariantPracticeCorpusRepository(fakeClient);
assert.equal(repository.is_database_configured, true);

const hashes = await repository.listEmbeddingHashes();
assert.equal(hashes.get("practice-1"), "hash-1");
assert.equal(hashes.has("practice-2"), false);

const selectCall = calls.find((call) => call.kind === "select");
assert.equal(selectCall.columns, "id, embedding_hash");
const eqCall = calls.find((call) => call.kind === "eq");
assert.equal(eqCall.column, "is_active");
assert.equal(eqCall.value, true);

await repository.upsertItems([
  {
    id: "practice-1",
    corpus_version: "enriched-practice-corpus-v0",
    source_candidate_id: "candidate-1",
    question_text: "题干",
    search_text: "检索文本",
    embedding_text: "embedding text",
    embedding_hash: "hash-1",
    embedding_model: "text-embedding-3-small",
    embedding: [0.1, 0.2, 0.3],
    knowledge_points: ["derivative"],
    section_title: "考点 2 导数与函数的单调性",
    difficulty: null,
    target_skills: ["monotonicity"],
    method_tags: ["monotonicity_by_derivative"],
    feature_flags: [],
    source_ref: { pdf_page_index: 1 },
    tag_review_meta: { review_status: "approved" },
    review_status: "approved",
  },
]);

const upsertCall = calls.find((call) => call.kind === "upsert");
assert.equal(upsertCall.options.onConflict, "id");
assert.equal(upsertCall.payload[0].is_active, true);
assert.equal(typeof upsertCall.payload[0].updated_at, "string");
assert.equal(typeof upsertCall.payload[0].last_synced_at, "string");

await repository.deactivateMissingItems(["practice-1"]);
const updateCall = calls.find((call) => call.kind === "update");
assert.deepEqual(updateCall.payload, { is_active: false });
const notCall = calls.find((call) => call.kind === "not");
assert.equal(notCall.column, "id");
assert.equal(notCall.operator, "in");
assert.equal(notCall.value, '("practice-1")');

calls.length = 0;
await repository.deactivateMissingItems(['practice,"quoted"', "practice\\slash"]);
const escapedNotCall = calls.find((call) => call.kind === "not");
assert.equal(
  escapedNotCall.value,
  '("practice,\\"quoted\\"","practice\\\\slash")',
);

calls.length = 0;
await repository.deactivateMissingItems([]);
assert.equal(calls.some((call) => call.kind === "not"), false);

const matches = await repository.matchItems({
  query_embedding: Array.from({ length: 1536 }, () => 0.01),
  match_count: 12,
  knowledge_points: ["derivative"],
  target_skills: ["monotonicity"],
  section_title: "考点 2 导数与函数的单调性",
  timeout_ms: 1000,
});

assert.equal(matches.length, 1);
assert.equal(matches[0].id, "practice-1");
assert.equal(matches[0].review_status, "approved");
assert.equal(matches[0].cosine_distance, 0.12);
assert.equal(matches[0].metadata_score, 20);
const rpcCall = calls.find((call) => call.kind === "rpc");
assert.equal(rpcCall.name, "match_variant_practice_corpus_items");
assert.equal(rpcCall.params.p_match_count, 12);

const invalidRowRepository = createSupabaseVariantPracticeCorpusRepository({
  rpc() {
    return Promise.resolve({
      data: [
        {
          id: "practice-invalid",
          source_candidate_id: "candidate-invalid",
          question_text: "题干",
          search_text: "检索文本",
          knowledge_points: ["derivative"],
          section_title: null,
          difficulty: null,
          target_skills: ["monotonicity"],
          method_tags: ["monotonicity_by_derivative"],
          feature_flags: [],
          source_ref: {},
          tag_review_meta: {},
          cosine_distance: 0.2,
        },
      ],
      error: null,
    });
  },
  from() {
    throw new Error("not used");
  },
});

assert.deepEqual(
  await invalidRowRepository.matchItems({
    query_embedding: [0.1],
    match_count: 12,
    knowledge_points: ["derivative"],
    target_skills: [],
    section_title: null,
    timeout_ms: 20,
  }),
  [],
);

const errorRepository = createSupabaseVariantPracticeCorpusRepository({
  rpc() {
    return Promise.resolve({ data: null, error: new Error("rpc failed") });
  },
  from() {
    throw new Error("not used");
  },
});

assert.deepEqual(
  await errorRepository.matchItems({
    query_embedding: [0.1],
    match_count: 12,
    knowledge_points: ["derivative"],
    target_skills: [],
    section_title: null,
    timeout_ms: 20,
  }),
  [],
);

const hangingRepository = createSupabaseVariantPracticeCorpusRepository({
  rpc() {
    return new Promise(() => {});
  },
  from() {
    throw new Error("not used");
  },
});

const startedAt = Date.now();
const timeoutMatches = await hangingRepository.matchItems({
  query_embedding: [0.1],
  match_count: 12,
  knowledge_points: ["derivative"],
  target_skills: [],
  section_title: null,
  timeout_ms: 20,
});
assert.deepEqual(timeoutMatches, []);
assert.equal(Date.now() - startedAt < 1000, true);

console.log("variant practice corpus persistence tests passed");
