import {
  createSupabaseAdminClient,
  getSupabaseAdminConfig,
} from "@/lib/persistence/supabase-admin";
import { isMistakeBookResponse } from "@/lib/mistake-book/mistake-book-client";
import type {
  MistakeBookItemSummary,
  MistakeBookResponse,
} from "@/lib/mistake-book/mistake-book-client";

export const DATABASE_READ_NOT_CONFIGURED_WARNING =
  "数据库暂未配置，错题本暂为空。";
export const DATABASE_READ_FAILED_WARNING = "错题本暂时读取失败。";
export const DATABASE_DELETE_NOT_CONFIGURED_WARNING =
  "数据库暂未配置，错题本删除已跳过。";
export const DATABASE_DELETE_FAILED_WARNING = "错题本暂时删除失败。";

const DEMO_STUDENT_ID = "demo_student_001";
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const MISTAKE_BOOK_SELECT_FIELDS = [
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
].join(", ");

export type MistakeBookApiResponse =
  | MistakeBookResponse
  | MistakeBookDeleteResponse
  | MistakeBookErrorResponse;

export interface MistakeBookDeleteResponse {
  student_id: typeof DEMO_STUDENT_ID;
  item_id: string;
  deleted: boolean;
  is_database_configured: boolean;
  warnings: string[];
}

export interface MistakeBookErrorResponse {
  error: {
    code: "invalid_request";
    message: string;
    recoverable: true;
  };
  warnings: string[];
}

export interface MistakeBookRepository {
  is_database_configured: boolean;
  listRecentItems(input: {
    student_id: typeof DEMO_STUDENT_ID;
    limit: number;
  }): Promise<MistakeBookItemSummary[]>;
  deleteItem(input: {
    student_id: typeof DEMO_STUDENT_ID;
    item_id: string;
  }): Promise<void>;
}

export interface SupabaseMistakeBookClient {
  from(tableName: string): {
    select(fields: string): {
      eq(
        columnName: string,
        value: string,
      ): {
        order(
          columnName: string,
          options: { ascending: boolean },
        ): {
          limit(
            limit: number,
          ): PromiseLike<{ data: unknown; error: unknown }>;
        };
      };
    };
    delete(): SupabaseMistakeBookDeleteBuilder;
  };
}

interface SupabaseMistakeBookDeleteBuilder
  extends PromiseLike<{ data: unknown; error: unknown }> {
  select(fields: string): SupabaseMistakeBookDeleteBuilder;
  eq(columnName: string, value: string): SupabaseMistakeBookDeleteBuilder;
}

export async function handleMistakeBookRequest(
  searchParams: URLSearchParams | Record<string, string | undefined>,
  options: {
    repository?: MistakeBookRepository;
  } = {},
): Promise<{ status: number; body: MistakeBookApiResponse }> {
  const parsedRequest = parseMistakeBookRequest(searchParams);
  if (!parsedRequest.ok) {
    return { status: 400, body: parsedRequest.response };
  }

  try {
    const repository = options.repository ?? createDefaultMistakeBookRepository();
    if (!repository.is_database_configured) {
      return {
        status: 200,
        body: {
          student_id: DEMO_STUDENT_ID,
          items: [],
          is_database_configured: false,
          warnings: [DATABASE_READ_NOT_CONFIGURED_WARNING],
        },
      };
    }

    const items = await repository.listRecentItems(parsedRequest.value);

    return {
      status: 200,
      body: {
        student_id: DEMO_STUDENT_ID,
        items,
        is_database_configured: true,
        warnings: [],
      },
    };
  } catch {
    return {
      status: 200,
      body: {
        student_id: DEMO_STUDENT_ID,
        items: [],
        is_database_configured: true,
        warnings: [DATABASE_READ_FAILED_WARNING],
      },
    };
  }
}

export async function handleMistakeBookDeleteRequest(
  body: unknown,
  options: {
    repository?: MistakeBookRepository;
  } = {},
): Promise<{ status: number; body: MistakeBookApiResponse }> {
  const parsedRequest = parseMistakeBookDeleteRequest(body);
  if (!parsedRequest.ok) {
    return { status: 400, body: parsedRequest.response };
  }

  try {
    const repository = options.repository ?? createDefaultMistakeBookRepository();
    if (!repository.is_database_configured) {
      return {
        status: 200,
        body: {
          student_id: DEMO_STUDENT_ID,
          item_id: parsedRequest.value.item_id,
          deleted: false,
          is_database_configured: false,
          warnings: [DATABASE_DELETE_NOT_CONFIGURED_WARNING],
        },
      };
    }

    await repository.deleteItem(parsedRequest.value);

    return {
      status: 200,
      body: {
        student_id: DEMO_STUDENT_ID,
        item_id: parsedRequest.value.item_id,
        deleted: true,
        is_database_configured: true,
        warnings: [],
      },
    };
  } catch {
    return {
      status: 200,
      body: {
        student_id: DEMO_STUDENT_ID,
        item_id: parsedRequest.value.item_id,
        deleted: false,
        is_database_configured: true,
        warnings: [DATABASE_DELETE_FAILED_WARNING],
      },
    };
  }
}

export function createDefaultMistakeBookRepository(): MistakeBookRepository {
  const config = getSupabaseAdminConfig();
  if (!config.ok) {
    return createDisabledMistakeBookRepository();
  }

  const client = createSupabaseAdminClient(
    config.value,
  ) as unknown as SupabaseMistakeBookClient;

  return createSupabaseMistakeBookRepository(client);
}

export function createDisabledMistakeBookRepository(): MistakeBookRepository {
  return {
    is_database_configured: false,
    async listRecentItems() {
      return [];
    },
    async deleteItem() {
      return;
    },
  };
}

export function createSupabaseMistakeBookRepository(
  client: SupabaseMistakeBookClient,
): MistakeBookRepository {
  return {
    is_database_configured: true,
    async listRecentItems(input) {
      const { data, error } = await client
        .from("mistake_book_items")
        .select(MISTAKE_BOOK_SELECT_FIELDS)
        .eq("student_id", input.student_id)
        .order("created_at", { ascending: false })
        .limit(input.limit);

      if (error || !Array.isArray(data)) {
        throw new Error("mistake book query failed");
      }

      return parseMistakeBookItems(data);
    },
    async deleteItem(input) {
      const { data, error } = await client
        .from("mistake_book_items")
        .delete()
        .select("id")
        .eq("id", input.item_id)
        .eq("student_id", input.student_id);

      if (error || !hasDeletedMistakeBookItem(data, input.item_id)) {
        throw new Error("mistake book delete failed");
      }
    },
  };
}

function parseMistakeBookRequest(
  searchParams: URLSearchParams | Record<string, string | undefined>,
):
  | {
      ok: true;
      value: { student_id: typeof DEMO_STUDENT_ID; limit: number };
    }
  | { ok: false; response: MistakeBookErrorResponse } {
  const studentId = getSearchParam(searchParams, "student_id");
  if (studentId !== DEMO_STUDENT_ID) {
    return invalidRequest("只支持 demo_student_001 的错题本。");
  }

  const limit = getSearchParam(searchParams, "limit");
  const parsedLimit = parseLimit(limit);
  if (parsedLimit === null) {
    return invalidRequest("limit 必须是 1 到 20 的整数。");
  }

  return {
    ok: true,
    value: {
      student_id: DEMO_STUDENT_ID,
      limit: parsedLimit,
    },
  };
}

function parseMistakeBookDeleteRequest(
  body: unknown,
):
  | {
      ok: true;
      value: { student_id: typeof DEMO_STUDENT_ID; item_id: string };
    }
  | { ok: false; response: MistakeBookErrorResponse } {
  if (!isRecord(body)) {
    return invalidRequest("DELETE body 必须包含 student_id 和 item_id。");
  }

  if (body.student_id !== DEMO_STUDENT_ID) {
    return invalidRequest("只支持 demo_student_001 的错题本。");
  }

  if (typeof body.item_id !== "string" || !isUuid(body.item_id)) {
    return invalidRequest("item_id 必须是 uuid 格式。");
  }

  return {
    ok: true,
    value: {
      student_id: DEMO_STUDENT_ID,
      item_id: body.item_id,
    },
  };
}

function getSearchParam(
  searchParams: URLSearchParams | Record<string, string | undefined>,
  key: string,
): string | undefined {
  if (searchParams instanceof URLSearchParams) {
    return searchParams.get(key) ?? undefined;
  }

  return searchParams[key];
}

function parseLimit(value: string | undefined): number | null {
  if (value === undefined) {
    return DEFAULT_LIMIT;
  }

  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const limit = Number(value);
  if (limit < 1 || limit > MAX_LIMIT) {
    return null;
  }

  return limit;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasDeletedMistakeBookItem(data: unknown, itemId: string): boolean {
  return (
    Array.isArray(data) &&
    data.some((item) => isRecord(item) && item.id === itemId)
  );
}

function invalidRequest(message: string): {
  ok: false;
  response: MistakeBookErrorResponse;
} {
  return {
    ok: false,
    response: {
      error: {
        code: "invalid_request",
        message,
        recoverable: true,
      },
      warnings: [],
    },
  };
}

function parseMistakeBookItems(data: unknown[]): MistakeBookItemSummary[] {
  const response = {
    student_id: DEMO_STUDENT_ID,
    items: data as MistakeBookItemSummary[],
    is_database_configured: true,
    warnings: [],
  } satisfies MistakeBookResponse;

  if (!isMistakeBookResponse(response)) {
    throw new Error("mistake book data shape is invalid");
  }

  return response.items;
}
