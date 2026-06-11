import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const {
  DATABASE_READ_FAILED_WARNING,
  DATABASE_READ_NOT_CONFIGURED_WARNING,
  createDisabledMistakeBookRepository,
  createSupabaseMistakeBookRepository,
  handleMistakeBookRequest,
} = jiti("../src/lib/mistake-book-service.ts");
const {
  isMistakeBookResponse,
  requestMistakeBookItems,
} = jiti("../src/lib/mistake-book-client.ts");
const { GET } = jiti("../src/app/api/mistake-book/route.ts");

const item = {
  id: "book_item_001",
  diagnosis_run_id: "diag_run_001",
  source: "sample",
  question_text: "已知函数 f(x)=x^3-3ax+1，讨论单调性。",
  knowledge_points: ["derivative_monotonicity"],
  mistake_causes: ["classification_missing"],
  severity: "medium",
  diagnosis_summary: "分类讨论遗漏。",
  evidence_level: null,
  persistence_evidence: "student_work",
  profile_update_kind: "mistake_cause",
  review_status: 0,
  created_at: "2026-06-11T10:00:00.000Z",
};

const disabledResult = await handleMistakeBookRequest(
  { student_id: "demo_student_001", limit: "5" },
  { repository: createDisabledMistakeBookRepository() },
);

assert.equal(disabledResult.status, 200);
assert.deepEqual(disabledResult.body, {
  student_id: "demo_student_001",
  items: [],
  is_database_configured: false,
  warnings: [DATABASE_READ_NOT_CONFIGURED_WARNING],
});

const invalidStudentResult = await handleMistakeBookRequest(
  { student_id: "student_002", limit: "5" },
  { repository: createRecordingRepository([item]) },
);

assert.equal(invalidStudentResult.status, 400);
assert.equal(invalidStudentResult.body.error.code, "invalid_request");
assert.equal(invalidStudentResult.body.error.recoverable, true);

for (const limit of ["0", "21", "3.5", "abc", "", " 5"]) {
  const invalidLimitResult = await handleMistakeBookRequest(
    { student_id: "demo_student_001", limit },
    { repository: createRecordingRepository([item]) },
  );

  assert.equal(invalidLimitResult.status, 400);
  assert.equal(invalidLimitResult.body.error.code, "invalid_request");
}

const defaultLimitRepository = createRecordingRepository([]);
await handleMistakeBookRequest(
  { student_id: "demo_student_001" },
  { repository: defaultLimitRepository },
);
assert.equal(defaultLimitRepository.calls[0].limit, 5);

const successRepository = createRecordingRepository([item]);
const successResult = await handleMistakeBookRequest(
  { student_id: "demo_student_001", limit: "1" },
  { repository: successRepository },
);

assert.equal(successResult.status, 200);
assert.equal(successRepository.calls.length, 1);
assert.deepEqual(successRepository.calls[0], {
  student_id: "demo_student_001",
  limit: 1,
});
assert.deepEqual(successResult.body, {
  student_id: "demo_student_001",
  items: [item],
  is_database_configured: true,
  warnings: [],
});

const failingResult = await handleMistakeBookRequest(
  { student_id: "demo_student_001", limit: "5" },
  { repository: createFailingRepository() },
);

assert.equal(failingResult.status, 200);
assert.deepEqual(failingResult.body, {
  student_id: "demo_student_001",
  items: [],
  is_database_configured: true,
  warnings: [DATABASE_READ_FAILED_WARNING],
});
assert.equal(JSON.stringify(failingResult.body).includes("service role"), false);

const routeResponse = await GET(
  new Request("http://localhost/api/mistake-book?student_id=demo_student_001"),
);
const routeBody = await routeResponse.json();

assert.equal(routeResponse.status, 200);
assert.equal(routeBody.student_id, "demo_student_001");
assert.deepEqual(routeBody.items, []);
assert.equal(routeBody.is_database_configured, false);
assert.deepEqual(routeBody.warnings, [DATABASE_READ_NOT_CONFIGURED_WARNING]);

const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.SUPABASE_URL = "not-a-url";
process.env.SUPABASE_SERVICE_ROLE_KEY = "local-test-key";
try {
  const malformedConfigResult = await handleMistakeBookRequest({
    student_id: "demo_student_001",
    limit: "5",
  });

  assert.equal(malformedConfigResult.status, 200);
  assert.deepEqual(malformedConfigResult.body, {
    student_id: "demo_student_001",
    items: [],
    is_database_configured: true,
    warnings: [DATABASE_READ_FAILED_WARNING],
  });
  assert.equal(
    JSON.stringify(malformedConfigResult.body).includes("local-test-key"),
    false,
  );
} finally {
  restoreEnv("SUPABASE_URL", originalSupabaseUrl);
  restoreEnv("SUPABASE_SERVICE_ROLE_KEY", originalSupabaseServiceRoleKey);
}

const selectedFields = [];
const supabaseRepository = createSupabaseMistakeBookRepository({
  from(tableName) {
    assert.equal(tableName, "mistake_book_items");

    return {
      select(fields) {
        selectedFields.push(fields);

        return {
          eq(column, value) {
            assert.equal(column, "student_id");
            assert.equal(value, "demo_student_001");

            return {
              order(columnName, options) {
                assert.equal(columnName, "created_at");
                assert.deepEqual(options, { ascending: false });

                return {
                  limit(limit) {
                    assert.equal(limit, 5);

                    return Promise.resolve({
                      data: [item],
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      },
    };
  },
});
const supabaseItems = await supabaseRepository.listRecentItems({
  student_id: "demo_student_001",
  limit: 5,
});

assert.deepEqual(supabaseItems, [item]);
assert.equal(
  selectedFields[0],
  [
    "id",
    "diagnosis_run_id",
    "source",
    "question_text",
    "knowledge_points",
    "mistake_causes",
    "severity",
    "diagnosis_summary",
    "evidence_level",
    "persistence_evidence",
    "profile_update_kind",
    "review_status",
    "created_at",
  ].join(", "),
);

assert.equal(isMistakeBookResponse(successResult.body), true);
assert.equal(
  isMistakeBookResponse({
    ...successResult.body,
    items: [{ ...item, question_text: null }],
  }),
  false,
);
assert.equal(
  isMistakeBookResponse({
    ...successResult.body,
    items: [{ ...item, image_base64: "secret" }],
  }),
  false,
);

const clientRequests = [];
const clientResult = await requestMistakeBookItems({
  fetcher: async (url, init) => {
    clientRequests.push({ url, init });

    return new Response(JSON.stringify(successResult.body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
  student_id: "demo_student_001",
  limit: 5,
});

assert.deepEqual(clientResult, successResult.body);
assert.equal(
  clientRequests[0].url,
  "/api/mistake-book?student_id=demo_student_001&limit=5",
);
assert.deepEqual(clientRequests[0].init, { method: "GET", cache: "no-store" });

await assert.rejects(
  () =>
    requestMistakeBookItems({
      fetcher: async () =>
        new Response(JSON.stringify({ error: { code: "invalid_request" } }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      student_id: "student_002",
      limit: 5,
    }),
  /错题本暂时读取失败。/,
);

await assert.rejects(
  () =>
    requestMistakeBookItems({
      fetcher: async () => {
        throw new Error("network failed with secret");
      },
      student_id: "demo_student_001",
      limit: 5,
    }),
  /错题本暂时读取失败。/,
);

await assert.rejects(
  () =>
    requestMistakeBookItems({
      fetcher: async () =>
        new Response(JSON.stringify({ ...successResult.body, warnings: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      student_id: "demo_student_001",
      limit: 5,
    }),
  /错题本返回格式异常。/,
);

function createRecordingRepository(items) {
  return {
    is_database_configured: true,
    calls: [],
    async listRecentItems(input) {
      this.calls.push(input);
      return items;
    },
  };
}

function createFailingRepository() {
  return {
    is_database_configured: true,
    async listRecentItems() {
      throw new Error("service role key leaked");
    },
  };
}

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

console.log("mistake book API regression test passed");
