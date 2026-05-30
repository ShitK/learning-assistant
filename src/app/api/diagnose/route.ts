import { NextResponse } from "next/server";
import { createDiagnoseError } from "@/lib/diagnose-api";
import { handleDiagnoseRequest } from "@/lib/diagnose-service";
import type { DiagnoseApiResponse } from "@/lib/diagnose-api";

export async function POST(
  request: Request,
): Promise<NextResponse<DiagnoseApiResponse>> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      createDiagnoseError("invalid_json", "请求体不是合法 JSON。", true),
      { status: 400 },
    );
  }

  const result = await handleDiagnoseRequest(payload);
  return NextResponse.json(result.body, { status: result.status });
}
