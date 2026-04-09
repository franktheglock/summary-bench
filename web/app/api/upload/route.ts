export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/db";
import { benchmarkUploadSchema, type BenchmarkUpload } from "@/lib/upload-schema";

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
    const database = getDatabase();
    const upsertRun = database.prepare(
      `
        insert into runs (
          run_id,
          model,
          provider,
          benchmark_version,
          config,
          timestamp
        ) values (?, ?, ?, ?, ?, ?)
        on conflict(run_id) do update set
          model = excluded.model,
          provider = excluded.provider,
          benchmark_version = excluded.benchmark_version,
          config = excluded.config,
          timestamp = excluded.timestamp
      `
    );
    const deleteResults = database.prepare("delete from test_results where run_id = ?");
    const upsertResult = database.prepare(
      `
        insert into test_results (
          run_id,
          test_id,
          category,
          summary,
          input_tokens,
          output_tokens,
          latency_ms
        ) values (?, ?, ?, ?, ?, ?, ?)
        on conflict(run_id, test_id) do update set
          category = excluded.category,
          summary = excluded.summary,
          input_tokens = excluded.input_tokens,
          output_tokens = excluded.output_tokens,
          latency_ms = excluded.latency_ms
      `
    );

    const persistUpload = database.transaction((currentUpload: BenchmarkUpload) => {
      upsertRun.run(
        currentUpload.run_id,
        currentUpload.model,
        currentUpload.provider,
        currentUpload.benchmark_version,
        JSON.stringify(currentUpload.config ?? {}),
        currentUpload.timestamp
      );

      deleteResults.run(currentUpload.run_id);

      for (const result of currentUpload.results) {
        upsertResult.run(
          currentUpload.run_id,
          result.test_id,
          result.category,
          result.summary,
          result.input_tokens ?? null,
          result.output_tokens ?? null,
          result.latency_ms ?? null
        );
      }

      return currentUpload.results.length;
    });

    const savedResults = persistUpload(upload);

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
