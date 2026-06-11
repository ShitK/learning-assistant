import { NextResponse } from "next/server";
import { handleMistakeBookRequest } from "@/lib/mistake-book-service";
import type { MistakeBookApiResponse } from "@/lib/mistake-book-service";

export async function GET(
  request: Request,
): Promise<NextResponse<MistakeBookApiResponse>> {
  const result = await handleMistakeBookRequest(
    new URL(request.url).searchParams,
  );

  return NextResponse.json(result.body, { status: result.status });
}
