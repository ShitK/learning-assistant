import { NextResponse } from "next/server";
import { handleStudentProfileRequest } from "@/lib/student-profile/student-profile-service";

export async function GET(request: Request): Promise<NextResponse> {
  const result = await handleStudentProfileRequest(
    new URL(request.url).searchParams,
  );

  return NextResponse.json(result.body, { status: result.status });
}
