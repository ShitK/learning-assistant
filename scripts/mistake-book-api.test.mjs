import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const {
  DATABASE_DELETE_FAILED_WARNING,
  DATABASE_DELETE_NOT_CONFIGURED_WARNING,
  DATABASE_READ_FAILED_WARNING,
  DATABASE_READ_NOT_CONFIGURED_WARNING,
  createDisabledMistakeBookRepository,
  createSupabaseMistakeBookRepository,
  handleMistakeBookDeleteRequest,
  handleMistakeBookRequest,
} = jiti("../src/lib/mistake-book/mistake-book-service.ts");
const {
  deleteMistakeBookItem,
  isMistakeBookResponse,
  requestMistakeBookItems,
} = jiti("../src/lib/mistake-book/mistake-book-client.ts");
const { DELETE, GET } = jiti("../src/app/api/mistake-book/route.ts");

const itemId = "11111111-1111-4111-8111-111111111111";

const item = {
  id: itemId,
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

const deleteRepository = createRecordingRepository([item]);
const deleteSuccessResult = await handleMistakeBookDeleteRequest(
  { student_id: "demo_student_001", item_id: itemId },
  { repository: deleteRepository },
);

assert.equal(deleteSuccessResult.status, 200);
assert.deepEqual(deleteRepository.deleteCalls, [
  { student_id: "demo_student_001", item_id: itemId },
]);
assert.deepEqual(deleteSuccessResult.body, {
  student_id: "demo_student_001",
  item_id: itemId,
  deleted: true,
  is_database_configured: true,
  warnings: [],
});

const deleteInvalidStudentResult = await handleMistakeBookDeleteRequest(
  { student_id: "student_002", item_id: itemId },
  { repository: createRecordingRepository([item]) },
);

assert.equal(deleteInvalidStudentResult.status, 400);
assert.equal(deleteInvalidStudentResult.body.error.code, "invalid_request");
assert.equal(deleteInvalidStudentResult.body.error.recoverable, true);

const deleteInvalidItemResult = await handleMistakeBookDeleteRequest(
  { student_id: "demo_student_001", item_id: "book_item_001" },
  { repository: createRecordingRepository([item]) },
);

assert.equal(deleteInvalidItemResult.status, 400);
assert.equal(deleteInvalidItemResult.body.error.code, "invalid_request");

const deleteDisabledResult = await handleMistakeBookDeleteRequest(
  { student_id: "demo_student_001", item_id: itemId },
  { repository: createDisabledMistakeBookRepository() },
);

assert.equal(deleteDisabledResult.status, 200);
assert.deepEqual(deleteDisabledResult.body, {
  student_id: "demo_student_001",
  item_id: itemId,
  deleted: false,
  is_database_configured: false,
  warnings: [DATABASE_DELETE_NOT_CONFIGURED_WARNING],
});

const deleteFailingResult = await handleMistakeBookDeleteRequest(
  { student_id: "demo_student_001", item_id: itemId },
  { repository: createFailingRepository() },
);

assert.equal(deleteFailingResult.status, 200);
assert.deepEqual(deleteFailingResult.body, {
  student_id: "demo_student_001",
  item_id: itemId,
  deleted: false,
  is_database_configured: true,
  warnings: [DATABASE_DELETE_FAILED_WARNING],
});
assert.equal(
  JSON.stringify(deleteFailingResult.body).includes("service role"),
  false,
);

const routeResponse = await GET(
  new Request("http://localhost/api/mistake-book?student_id=demo_student_001"),
);
const routeBody = await routeResponse.json();

assert.equal(routeResponse.status, 200);
assert.equal(routeBody.student_id, "demo_student_001");
assert.deepEqual(routeBody.items, []);
assert.equal(routeBody.is_database_configured, false);
assert.deepEqual(routeBody.warnings, [DATABASE_READ_NOT_CONFIGURED_WARNING]);

const deleteRouteResponse = await DELETE(
  new Request("http://localhost/api/mistake-book", {
    method: "DELETE",
    body: JSON.stringify({
      student_id: "demo_student_001",
      item_id: itemId,
    }),
    headers: { "Content-Type": "application/json" },
  }),
);
const deleteRouteBody = await deleteRouteResponse.json();

assert.equal(deleteRouteResponse.status, 200);
assert.equal(deleteRouteBody.student_id, "demo_student_001");
assert.equal(deleteRouteBody.item_id, itemId);
assert.equal(deleteRouteBody.deleted, false);
assert.equal(deleteRouteBody.is_database_configured, false);
assert.deepEqual(deleteRouteBody.warnings, [
  DATABASE_DELETE_NOT_CONFIGURED_WARNING,
]);

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

const deleteFilters = [];
const supabaseDeleteRepository = createSupabaseMistakeBookRepository({
  from(tableName) {
    assert.equal(tableName, "mistake_book_items");

    return {
      delete() {
        return {
          select(fields) {
            assert.equal(fields, "id");
            return this;
          },
          eq(column, value) {
            deleteFilters.push({ column, value });

            if (deleteFilters.length === 1) {
              return this;
            }

            return Promise.resolve({ data: [{ id: itemId }], error: null });
          },
        };
      },
    };
  },
});
await supabaseDeleteRepository.deleteItem({
  student_id: "demo_student_001",
  item_id: itemId,
});
assert.deepEqual(deleteFilters, [
  { column: "id", value: itemId },
  { column: "student_id", value: "demo_student_001" },
]);

const supabaseDeleteNoRowsRepository = createSupabaseMistakeBookRepository({
  from() {
    return {
      delete() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          then(resolve) {
            return Promise.resolve(
              resolve({ data: [], error: null }),
            );
          },
        };
      },
    };
  },
});
await assert.rejects(
  () =>
    supabaseDeleteNoRowsRepository.deleteItem({
      student_id: "demo_student_001",
      item_id: itemId,
    }),
  /mistake book delete failed/,
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

const deleteClientRequests = [];
const deleteClientResult = await deleteMistakeBookItem({
  fetcher: async (url, init) => {
    deleteClientRequests.push({ url, init });

    return new Response(JSON.stringify(deleteSuccessResult.body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
  student_id: "demo_student_001",
  item_id: itemId,
});

assert.deepEqual(deleteClientResult, deleteSuccessResult.body);
assert.equal(deleteClientRequests[0].url, "/api/mistake-book");
assert.equal(deleteClientRequests[0].init.method, "DELETE");
assert.equal(
  deleteClientRequests[0].init.headers["Content-Type"],
  "application/json",
);
assert.deepEqual(JSON.parse(deleteClientRequests[0].init.body), {
  student_id: "demo_student_001",
  item_id: itemId,
});

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

await assert.rejects(
  () =>
    deleteMistakeBookItem({
      fetcher: async () =>
        new Response(JSON.stringify({ error: { code: "invalid_request" } }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      student_id: "student_002",
      item_id: itemId,
    }),
  /错题本删除失败。/,
);

await assert.rejects(
  () =>
    deleteMistakeBookItem({
      fetcher: async () =>
        new Response(
          JSON.stringify({
            student_id: "demo_student_001",
            item_id: itemId,
            deleted: false,
            is_database_configured: false,
            warnings: [DATABASE_DELETE_NOT_CONFIGURED_WARNING],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      student_id: "demo_student_001",
      item_id: itemId,
    }),
  /错题本删除失败。/,
);

await assert.rejects(
  () =>
    deleteMistakeBookItem({
      fetcher: async () => {
        throw new Error("network failed with service role key");
      },
      student_id: "demo_student_001",
      item_id: itemId,
    }),
  /错题本删除失败。/,
);

function createRecordingRepository(items) {
  return {
    is_database_configured: true,
    calls: [],
    deleteCalls: [],
    async listRecentItems(input) {
      this.calls.push(input);
      return items;
    },
    async deleteItem(input) {
      this.deleteCalls.push(input);
    },
  };
}

function createFailingRepository() {
  return {
    is_database_configured: true,
    async listRecentItems() {
      throw new Error("service role key leaked");
    },
    async deleteItem() {
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
