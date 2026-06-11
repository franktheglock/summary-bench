import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

import { saveBenchmarkUpload } from "@/lib/arena-store";
import { benchmarkUploadSchema } from "@/lib/upload-schema";
import { getModeratorContext } from "@/lib/moderation-auth";
import { hasSupabaseAuthConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  let uploaderId: string | null = null;

  if (hasSupabaseAuthConfig()) {
    const moderatorContext = await getModeratorContext();

    if (!moderatorContext.user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (!moderatorContext.isModerator) {
      return NextResponse.json({ error: "Moderator access required." }, { status: 403 });
    }

    uploaderId = moderatorContext.user.id;
  }

  // Look for results JSON files in the project root `results/` directory
  const resultsDir = join(process.cwd(), "..", "results");
  let files: string[];
  try {
    files = await readdir(resultsDir);
  } catch {
    return NextResponse.json(
      { error: `Results directory not found at ${resultsDir}` },
      { status: 404 }
    );
  }

  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  const outcomes: Array<{
    file: string;
    status: "uploaded" | "skipped" | "error";
    results?: number;
    error?: string;
  }> = [];

  for (const file of jsonFiles) {
    let content: string;
    try {
      content = await readFile(join(resultsDir, file), "utf-8");
    } catch {
      outcomes.push({ file, status: "error", error: "Failed to read file" });
      continue;
    }

    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      outcomes.push({ file, status: "skipped", error: "Invalid JSON" });
      continue;
    }

    const parsed = benchmarkUploadSchema.safeParse(json);
    if (!parsed.success) {
      outcomes.push({
        file,
        status: "skipped",
        error: parsed.error.issues[0].message,
      });
      continue;
    }

    try {
      const count = await saveBenchmarkUpload(parsed.data, uploaderId);
      outcomes.push({ file, status: "uploaded", results: count });
    } catch (error) {
      outcomes.push({
        file,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const uploaded = outcomes.filter((o) => o.status === "uploaded").length;
  const errors = outcomes.filter((o) => o.status === "error").length;
  const skipped = outcomes.filter((o) => o.status === "skipped").length;

  return NextResponse.json({
    ok: true,
    total: jsonFiles.length,
    uploaded,
    errors,
    skipped,
    outcomes,
  });
}
