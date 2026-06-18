import { NextResponse } from "next/server";

import { handleStudentProfileEvidenceRequest } from "@/lib/student-profile/student-profile-evidence-service";

export async function GET(request: Request): Promise<NextResponse> {
  const result = await handleStudentProfileEvidenceRequest(
    new URL(request.url).searchParams,
  );

  return NextResponse.json(result.body, { status: result.status });
}
