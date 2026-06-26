import { NextResponse } from "next/server";
import { createDiagnoseError } from "@/lib/diagnosis/diagnose-api";
import {
  handleDynamicVariantPracticeRequest,
  type DynamicVariantPracticeApiResponse,
} from "@/lib/server/rag/dynamic-variant-practice-service";

export async function POST(
  request: Request,
): Promise<NextResponse<DynamicVariantPracticeApiResponse>> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      createDiagnoseError(
        "invalid_json",
        "请求体不是合法 JSON，请重新提交。",
        true,
      ),
      { status: 400 },
    );
  }

  const result = await handleDynamicVariantPracticeRequest(payload);
  return NextResponse.json(result.body, { status: result.status });
}
