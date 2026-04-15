export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { saveBenchmarkUpload } from "@/lib/arena-store";
import { benchmarkUploadSchema } from "@/lib/upload-schema";

export async function POST(request: Request) {
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
  try {
    const savedResults = await saveBenchmarkUpload(upload);

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
