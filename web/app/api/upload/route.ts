export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { saveBenchmarkUpload } from "@/lib/arena-store";
import { getTemporaryUploadLink, touchTemporaryUploadLink } from "@/lib/arena-store";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { benchmarkUploadSchema, type BenchmarkUpload } from "@/lib/upload-schema";
import { createSupabaseServerClient, hasSupabaseAuthConfig } from "@/lib/supabase/server";

function parseUploadPayload(payload: unknown): BenchmarkUpload[] {
  if (Array.isArray(payload)) {
    const uploads: BenchmarkUpload[] = [];

    for (const entry of payload) {
      const parsed = benchmarkUploadSchema.safeParse(entry);
      if (!parsed.success) {
        throw new Error("Invalid benchmark upload schema.");
      }

      uploads.push(parsed.data);
    }

    return uploads;
  }

  const parsed = benchmarkUploadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Invalid benchmark upload schema.");
  }

  return [parsed.data];
}

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

  let uploads: BenchmarkUpload[];
  try {
    uploads = parseUploadPayload(payload);
  } catch {
    return NextResponse.json(
      {
        error: "Invalid benchmark upload schema.",
        details: ["Each entry must match the benchmark upload schema."],
      },
      { status: 400 }
    );
  }

  const uploadSecret = process.env.SUMMARYARENA_UPLOAD_SECRET?.trim();
  const providedSecret = request.headers.get("x-upload-secret")?.trim() || null;
  const uploadToken = request.headers.get("x-upload-token")?.trim() || new URL(request.url).searchParams.get("token")?.trim() || null;

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

  if (!uploaderId) {
    const hasDirectSecret = Boolean(uploadSecret && providedSecret && providedSecret === uploadSecret);

    if (!hasDirectSecret && !uploadToken) {
      return NextResponse.json({ error: "Authentication or a temporary upload link is required." }, { status: 401 });
    }

    if (hasDirectSecret) {
      // Direct secret auth is intentionally allowed for scripted imports.
    } else {
      if (!uploadToken) {
        return NextResponse.json({ error: "Temporary upload link is required." }, { status: 401 });
      }

      const temporaryAccess = await getTemporaryUploadLink(uploadToken);
      if (!temporaryAccess) {
        return NextResponse.json({ error: "Temporary upload link is invalid or expired." }, { status: 401 });
      }

      await touchTemporaryUploadLink(uploadToken);
    }
  }

  try {
    const savedResults = await Promise.all(
      uploads.map(async (upload) => {
        const count = await saveBenchmarkUpload(upload, uploaderId);
        return { run_id: upload.run_id, saved_results: count };
      })
    );

    return NextResponse.json({
      ok: true,
      uploaded: savedResults.length,
      results: savedResults,
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
