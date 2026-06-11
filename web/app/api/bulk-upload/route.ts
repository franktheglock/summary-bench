import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

import { saveBenchmarkUpload } from "@/lib/arena-store";
import { benchmarkUploadSchema } from "@/lib/upload-schema";
import { getModeratorContext } from "@/lib/moderation-auth";
import { hasSupabaseAuthConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ResultsSourceFile = {
  name: string;
  readText: () => Promise<string>;
};

type ResultsSource = {
  label: string;
  files: ResultsSourceFile[];
};

const DEFAULT_RESULTS_REPO_API = "https://api.github.com/repos/franktheglock/summary-bench/contents/results?ref=master";

async function loadLocalResultsSource(): Promise<ResultsSource | null> {
  const candidates = [
    join(process.cwd(), "..", "results"),
    join(process.cwd(), "results"),
  ];

  for (const candidate of candidates) {
    try {
      const files = await readdir(candidate);
      const jsonFiles = files.filter((file) => file.endsWith(".json"));

      if (jsonFiles.length === 0) {
        continue;
      }

      return {
        label: candidate,
        files: jsonFiles.map((file) => ({
          name: file,
          readText: () => readFile(join(candidate, file), "utf-8"),
        })),
      };
    } catch {
      continue;
    }
  }

  return null;
}

async function loadRemoteResultsSource(): Promise<ResultsSource> {
  const manifestUrl = process.env.SUMMARYARENA_RESULTS_API_URL?.trim() || DEFAULT_RESULTS_REPO_API;
  const response = await fetch(manifestUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "summaryarena-bulk-import",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Results manifest request failed (${response.status}) from ${manifestUrl}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error(`Results manifest at ${manifestUrl} did not return a directory listing.`);
  }

  const files = payload
    .filter((entry): entry is { name: string; download_url: string; type: string } => {
      return Boolean(
        entry &&
        typeof entry === "object" &&
        entry.type === "file" &&
        typeof entry.name === "string" &&
        entry.name.endsWith(".json") &&
        typeof entry.download_url === "string"
      );
    })
    .map((entry) => ({
      name: entry.name,
      readText: async () => {
        const fileResponse = await fetch(entry.download_url, {
          headers: {
            "User-Agent": "summaryarena-bulk-import",
          },
          cache: "no-store",
        });

        if (!fileResponse.ok) {
          throw new Error(`Failed to fetch ${entry.name} (${fileResponse.status})`);
        }

        return fileResponse.text();
      },
    }));

  if (files.length === 0) {
    throw new Error(`No JSON result files were found at ${manifestUrl}`);
  }

  return {
    label: manifestUrl,
    files,
  };
}

async function loadResultsSource(): Promise<ResultsSource> {
  const localSource = await loadLocalResultsSource();
  if (localSource) {
    return localSource;
  }

  return loadRemoteResultsSource();
}

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

  let source: ResultsSource;
  try {
    source = await loadResultsSource();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to locate result files." },
      { status: 404 }
    );
  }

  const outcomes: Array<{
    file: string;
    status: "uploaded" | "skipped" | "error";
    results?: number;
    error?: string;
  }> = [];

  for (const file of source.files) {
    let content: string;
    try {
      content = await file.readText();
    } catch {
      outcomes.push({ file: file.name, status: "error", error: "Failed to read file" });
      continue;
    }

    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      outcomes.push({ file: file.name, status: "skipped", error: "Invalid JSON" });
      continue;
    }

    const parsed = benchmarkUploadSchema.safeParse(json);
    if (!parsed.success) {
      outcomes.push({
        file: file.name,
        status: "skipped",
        error: parsed.error.issues[0].message,
      });
      continue;
    }

    try {
      const count = await saveBenchmarkUpload(parsed.data, uploaderId);
      outcomes.push({ file: file.name, status: "uploaded", results: count });
    } catch (error) {
      outcomes.push({
        file: file.name,
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
    source: source.label,
    total: source.files.length,
    uploaded,
    errors,
    skipped,
    outcomes,
  });
}
