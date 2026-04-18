export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { saveBenchmarkUpload } from "@/lib/arena-store";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { benchmarkUploadSchema } from "@/lib/upload-schema";
import { createSupabaseServerClient, hasSupabaseAuthConfig } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, {
    id: "upload:post",
    maxRequests: 10,
    windowMs: 15 * 60_000,
  });

  if (rateLimit.limited) {
    return createRateLimitResponse(rateLimit, "Too many uploads. Please wait before trying again.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = benchmarkUploadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid benchmark upload schema.",
        details: parsed.error.issues.map((issue) => issue.message),
      },
      { status: 400 }
    );
  }

  const upload = parsed.data;

  // Capture the uploading user's ID if they're authenticated
  let uploaderId: string | null = null;
  if (hasSupabaseAuthConfig()) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.auth.getUser();
      uploaderId = data.user?.id ?? null;
    } catch {
      // Non-fatal — upload proceeds without attribution
    }
  }

  try {
    const savedResults = await saveBenchmarkUpload(upload, uploaderId);

    return NextResponse.json({
      ok: true,
      run_id: upload.run_id,
      saved_results: savedResults,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    return NextResponse.json(
      {
        error: "Failed to save benchmark upload.",
        details: message,
      },
      { status: 500 }
    );
  }
}
