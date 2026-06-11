import { NextResponse } from "next/server";
import {
  handleMistakeBookDeleteRequest,
  handleMistakeBookRequest,
} from "@/lib/mistake-book-service";
import type { MistakeBookApiResponse } from "@/lib/mistake-book-service";

export async function GET(
  request: Request,
): Promise<NextResponse<MistakeBookApiResponse>> {
  const result = await handleMistakeBookRequest(
    new URL(request.url).searchParams,
  );

  return NextResponse.json(result.body, { status: result.status });
}

export async function DELETE(
  request: Request,
): Promise<NextResponse<MistakeBookApiResponse>> {
  const body = await readJsonBody(request);
  const result = await handleMistakeBookDeleteRequest(body);

  return NextResponse.json(result.body, { status: result.status });
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
