import { NextResponse } from "next/server";
import {
  buildSampleDiagnoseResponse,
  createDiagnoseError,
  getSampleDiagnosisById,
  parseDiagnoseRequest,
} from "@/lib/diagnose-api";
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

  const parsedRequest = parseDiagnoseRequest(payload);
  if (!parsedRequest.ok) {
    return NextResponse.json(parsedRequest.response, { status: 400 });
  }

  if (parsedRequest.value.task_type === "image_diagnosis") {
    return NextResponse.json(
      createDiagnoseError(
        "image_diagnosis_p1",
        "图片诊断属于 P1，P0 演示请先选择内置样例题。",
        true,
      ),
      { status: 400 },
    );
  }

  const sample = getSampleDiagnosisById(parsedRequest.value.sample_question_id);
  if (!sample) {
    return NextResponse.json(
      createDiagnoseError(
        "unknown_sample_question_id",
        "未找到这个样例题，请重新选择。",
        true,
      ),
      { status: 400 },
    );
  }

  return NextResponse.json(buildSampleDiagnoseResponse(sample, parsedRequest.value));
}
