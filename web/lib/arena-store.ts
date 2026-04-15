import { getDatabase } from "@/lib/db";
import { getSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";
import type { BenchmarkUpload } from "@/lib/upload-schema";

export type VoteChoice = "a" | "b" | "tie" | "both_bad";

export type VoteCandidate = {
  test_id: string;
  category: string;
  source_text: string;
  model_a: string;
  provider_a: string;
  summary_a: string;
  model_b: string;
  provider_b: string;
  summary_b: string;
};

export type LeaderboardRow = {
  model: string;
  provider: string;
  tests: number;
  votes: number;
  win_rate: number;
  avg_latency_ms: number;
  latest_run: string;
  elo?: number;
};

type SummaryRow = {
  model: string;
  provider: string;
  summary: string;
  test_id: string;
  category: string;
  run_id: string;
  timestamp: string;
  latency_ms: number | null;
};

type DatasetTestCase = {
  test_id: string;
  input_text: string;
};

type VoteRow = {
  test_id: string;
  model_a: string;
  model_b: string;
  outcome: VoteChoice;
  created_at: string;
};

type ArenaData = {
  summaryRows: SummaryRow[];
  votes: VoteRow[];
};

type CacheEntry<T> = {
  expiresAt: number;
  value?: T;
  promise?: Promise<T>;
};

const CACHE_TTL_MS = 60_000;

let datasetTestCasesPromise: Promise<Map<string, string>> | null = null;
const arenaDataCache = new Map<string, CacheEntry<ArenaData>>();
const leaderboardCache = new Map<string, CacheEntry<LeaderboardRow[]>>();
let categoriesCache: CacheEntry<string[]> | null = null;

function getStorageMode(): "sqlite" | "supabase" {
  const configuredMode = process.env.SUMMARYARENA_STORAGE?.trim().toLowerCase();

  if (configuredMode === "sqlite") {
    return "sqlite";
  }

  if (configuredMode === "supabase") {
    if (!hasSupabaseConfig()) {
      throw new Error("SUMMARYARENA_STORAGE is set to supabase, but Supabase environment variables are missing.");
    }

    return "supabase";
  }

  return hasSupabaseConfig() ? "supabase" : "sqlite";
}

function getCategoryCacheKey(category?: string): string {
  return category && category !== "all" ? category : "all";
}

function getCachedValue<T>(entry: CacheEntry<T> | null | undefined): T | null {
  if (!entry || entry.expiresAt <= Date.now() || typeof entry.value === "undefined") {
    return null;
  }

  return entry.value;
}

function invalidateStoreCaches(): void {
  arenaDataCache.clear();
  leaderboardCache.clear();
  categoriesCache = null;
}

async function readThroughCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  load: () => Promise<T>
): Promise<T> {
  const cached = cache.get(key);
  const cachedValue = getCachedValue(cached);
  if (cachedValue) {
    return cachedValue;
  }

  if (cached?.promise) {
    return cached.promise;
  }

  const promise = load()
    .then((value) => {
      cache.set(key, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        value,
      });
      return value;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    promise,
  });

  return promise;
}

async function loadDatasetTestCases(): Promise<Map<string, string>> {
  try {
    const [{ default: fs }, { default: path }] = await Promise.all([
      import("node:fs"),
      import("node:path"),
    ]);
    const datasetPath = path.resolve(process.cwd(), "..", "datasets", "v1", "test_cases.json");
    const raw = fs.readFileSync(datasetPath, "utf8");
    const parsed = JSON.parse(raw) as DatasetTestCase[];
    return new Map(parsed.map((testCase) => [testCase.test_id, testCase.input_text]));
  } catch {
    return new Map();
  }
}

async function getSourceText(testId: string): Promise<string> {
  if (!datasetTestCasesPromise) {
    datasetTestCasesPromise = loadDatasetTestCases();
  }

  const datasetTestCases = await datasetTestCasesPromise;
  return datasetTestCases.get(testId) || "";
}

function isNonEmptySummary(summary: string): boolean {
  return summary.trim().length > 0;
}

function compareTimestampsDescending(left: string, right: string): number {
  return new Date(right).getTime() - new Date(left).getTime();
}

function computeVoteCandidate(summaryRows: SummaryRow[], votes: VoteRow[]): Omit<VoteCandidate, "source_text"> | null {
  const votesByTestId = new Map<string, number>();
  for (const vote of votes) {
    votesByTestId.set(vote.test_id, (votesByTestId.get(vote.test_id) ?? 0) + 1);
  }

  const tests = new Map<string, { test_id: string; category: string; models: Set<string> }>();
  for (const row of summaryRows) {
    const current = tests.get(row.test_id) ?? {
      test_id: row.test_id,
      category: row.category,
      models: new Set<string>(),
    };
    current.models.add(row.model);
    tests.set(row.test_id, current);
  }

  const eligibleTests = [...tests.values()]
    .filter((test) => test.models.size >= 2)
    .sort((left, right) => {
      const voteDelta = (votesByTestId.get(left.test_id) ?? 0) - (votesByTestId.get(right.test_id) ?? 0);
      if (voteDelta !== 0) {
        return voteDelta;
      }

      const modelDelta = right.models.size - left.models.size;
      if (modelDelta !== 0) {
        return modelDelta;
      }

      return left.test_id.localeCompare(right.test_id);
    });

  const selectedTest = eligibleTests[0];
  if (!selectedTest) {
    return null;
  }

  const recentRows = summaryRows
    .filter((row) => row.test_id === selectedTest.test_id)
    .sort((left, right) => compareTimestampsDescending(left.timestamp, right.timestamp));

  const distinctModels = new Map<string, SummaryRow>();
  for (const row of recentRows) {
    if (!distinctModels.has(row.model)) {
      distinctModels.set(row.model, row);
    }
  }

  const pair = [...distinctModels.values()];
  if (pair.length < 2) {
    return null;
  }

  const firstIndex = Math.floor(Math.random() * pair.length);
  let secondIndex = Math.floor(Math.random() * (pair.length - 1));
  if (secondIndex >= firstIndex) {
    secondIndex += 1;
  }

  const selectedPair = [pair[firstIndex], pair[secondIndex]];
  if (Math.random() < 0.5) {
    selectedPair.reverse();
  }

  return {
    test_id: selectedTest.test_id,
    category: selectedTest.category,
    model_a: selectedPair[0].model,
    provider_a: selectedPair[0].provider,
    summary_a: selectedPair[0].summary,
    model_b: selectedPair[1].model,
    provider_b: selectedPair[1].provider,
    summary_b: selectedPair[1].summary,
  };
}

function computeLeaderboardRows(summaryRows: SummaryRow[], votes: VoteRow[]): LeaderboardRow[] {
  const testStats = new Map<string, {
    model: string;
    provider: string;
    tests: number;
    latencySum: number;
    latest_run: string;
  }>();

  for (const row of summaryRows) {
    const key = `${row.model}::${row.provider}`;
    const current = testStats.get(key) ?? {
      model: row.model,
      provider: row.provider,
      tests: 0,
      latencySum: 0,
      latest_run: row.timestamp,
    };

    current.tests += 1;
    current.latencySum += row.latency_ms ?? 0;
    if (compareTimestampsDescending(current.latest_run, row.timestamp) > 0) {
      current.latest_run = row.timestamp;
    }

    testStats.set(key, current);
  }

  const voteByModel = new Map<string, { score: number; appearance_count: number }>();
  for (const vote of votes) {
    const ensure = (model: string) => {
      if (!voteByModel.has(model)) {
        voteByModel.set(model, { score: 0, appearance_count: 0 });
      }

      return voteByModel.get(model)!;
    };

    const a = ensure(vote.model_a);
    const b = ensure(vote.model_b);
    a.appearance_count += 1;
    b.appearance_count += 1;

    if (vote.outcome === "a") {
      a.score += 1;
    } else if (vote.outcome === "b") {
      b.score += 1;
    } else if (vote.outcome === "tie") {
      a.score += 0.5;
      b.score += 0.5;
    }
  }

  const BASE_RATING = 1500;
  const ratings = new Map<string, number>();
  const appearances = new Map<string, number>();

  for (const row of testStats.values()) {
    ratings.set(row.model, BASE_RATING);
    appearances.set(row.model, 0);
  }

  function ensureModel(model: string) {
    if (!ratings.has(model)) {
      ratings.set(model, BASE_RATING);
      appearances.set(model, 0);
    }
  }

  function kFor(count: number) {
    const baseK = 40;
    return Math.max(8, Math.round(baseK / (1 + count / 50)));
  }

  const chronologicalVotes = [...votes].sort(
    (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  );

  for (const vote of chronologicalVotes) {
    const a = vote.model_a;
    const b = vote.model_b;
    ensureModel(a);
    ensureModel(b);

    const ratingA = ratings.get(a) as number;
    const ratingB = ratings.get(b) as number;
    const appA = appearances.get(a) ?? 0;
    const appB = appearances.get(b) ?? 0;

    let scoreA = 0.5;
    if (vote.outcome === "a") scoreA = 1;
    else if (vote.outcome === "b") scoreA = 0;
    else if (vote.outcome === "tie" || vote.outcome === "both_bad") scoreA = 0.5;

    const scoreB = 1 - scoreA;
    const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
    const expectedB = 1 - expectedA;
    const kA = kFor(appA);
    const kB = kFor(appB);

    ratings.set(a, ratingA + kA * (scoreA - expectedA));
    ratings.set(b, ratingB + kB * (scoreB - expectedB));

    appearances.set(a, appA + 1);
    appearances.set(b, appB + 1);
  }

  return [...testStats.values()]
    .map((row) => {
      const voteSummary = voteByModel.get(row.model);
      const appearanceCount = voteSummary?.appearance_count ?? 0;
      const score = voteSummary?.score ?? 0;
      const win_rate = appearanceCount > 0 ? Math.round((score / appearanceCount) * 100) : 0;

      return {
        model: row.model,
        provider: row.provider,
        tests: row.tests,
        votes: Math.round(appearanceCount),
        win_rate,
        avg_latency_ms: row.tests > 0 ? Math.round(row.latencySum / row.tests) : 0,
        latest_run: row.latest_run,
        elo: Math.round(ratings.get(row.model) ?? BASE_RATING),
      } satisfies LeaderboardRow;
    })
    .sort((left, right) => {
      const eloLeft = left.elo ?? BASE_RATING;
      const eloRight = right.elo ?? BASE_RATING;
      if (eloRight !== eloLeft) return eloRight - eloLeft;
      if (right.tests !== left.tests) return right.tests - left.tests;
      return left.model.localeCompare(right.model);
    });
}

async function loadSqliteArenaData(category?: string): Promise<ArenaData> {
  const database = await getDatabase();
  const categoryFilter = category && category !== "all" ? "and tr.category = ?" : "";
  const params = category && category !== "all" ? [category] : [];

  const summaryRows = database
    .prepare(
      `
        select
          r.model as model,
          r.provider as provider,
          tr.summary as summary,
          tr.test_id as test_id,
          tr.category as category,
          tr.run_id as run_id,
          r.timestamp as timestamp,
          tr.latency_ms as latency_ms
        from test_results tr
        join runs r on r.run_id = tr.run_id
        where coalesce(trim(tr.summary), '') <> ''
          ${categoryFilter}
      `
    )
    .all(...params) as SummaryRow[];

  const votes = database
    .prepare(
      `
        select
          v.test_id as test_id,
          v.model_a as model_a,
          v.model_b as model_b,
          v.outcome as outcome,
          v.created_at as created_at
        from votes v
        where 1 = 1
          ${category && category !== "all"
            ? "and exists (select 1 from test_results tr where tr.test_id = v.test_id and tr.category = ?)"
            : ""}
      `
    )
    .all(...params) as VoteRow[];

  return { summaryRows, votes };
}

async function loadSupabaseArenaData(category?: string): Promise<ArenaData> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase environment variables are missing.");
  }

  let testResultsQuery = supabase
    .from("test_results")
    .select("run_id, test_id, category, summary, latency_ms");

  if (category && category !== "all") {
    testResultsQuery = testResultsQuery.eq("category", category);
  }

  const { data: testResults, error: testResultsError } = await testResultsQuery;
  if (testResultsError) {
    throw new Error(testResultsError.message);
  }

  const filteredTestResults = (testResults ?? []).filter((row) => isNonEmptySummary(row.summary));
  const runIds = [...new Set(filteredTestResults.map((row) => row.run_id))];

  let runs: Array<{ run_id: string; model: string; provider: string; timestamp: string }> = [];
  if (runIds.length > 0) {
    const { data: runData, error: runsError } = await supabase
      .from("runs")
      .select("run_id, model, provider, timestamp")
      .in("run_id", runIds);

    if (runsError) {
      throw new Error(runsError.message);
    }

    runs = runData ?? [];
  }

  const runsById = new Map(runs.map((run) => [run.run_id, run]));
  const summaryRows: SummaryRow[] = filteredTestResults.flatMap((row) => {
    const run = runsById.get(row.run_id);
    if (!run) {
      return [];
    }

    return [{
      model: run.model,
      provider: run.provider,
      summary: row.summary,
      test_id: row.test_id,
      category: row.category,
      run_id: row.run_id,
      timestamp: run.timestamp,
      latency_ms: row.latency_ms,
    }];
  });

  let votesQuery = supabase
    .from("votes")
    .select("test_id, model_a, model_b, outcome, created_at");

  const testIds = [...new Set(summaryRows.map((row) => row.test_id))];
  if (category && category !== "all") {
    if (testIds.length === 0) {
      return { summaryRows, votes: [] };
    }

    votesQuery = votesQuery.in("test_id", testIds);
  }

  const { data: votes, error: votesError } = await votesQuery;
  if (votesError) {
    throw new Error(votesError.message);
  }

  return {
    summaryRows,
    votes: (votes ?? []) as VoteRow[],
  };
}

async function loadArenaData(category?: string): Promise<ArenaData> {
  const cacheKey = getCategoryCacheKey(category);
  return readThroughCache(arenaDataCache, cacheKey, async () => {
    return getStorageMode() === "supabase"
      ? loadSupabaseArenaData(category)
      : loadSqliteArenaData(category);
  });
}

export async function getVoteCandidate(category?: string): Promise<VoteCandidate | null> {
  const { summaryRows, votes } = await loadArenaData(category);
  const candidate = computeVoteCandidate(summaryRows, votes);

  if (!candidate) {
    return null;
  }

  return {
    ...candidate,
    source_text: await getSourceText(candidate.test_id),
  };
}

export async function recordVote(candidate: VoteCandidate, vote: VoteChoice): Promise<void> {
  if (getStorageMode() === "supabase") {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error("Supabase environment variables are missing.");
    }

    const { error } = await supabase.from("votes").insert({
      test_id: candidate.test_id,
      model_a: candidate.model_a,
      model_b: candidate.model_b,
      outcome: vote,
    });

    if (error) {
      throw new Error(error.message);
    }

    invalidateStoreCaches();
    return;
  }

  const database = await getDatabase();
  const insertVote = database.prepare(
    `
      insert into votes (test_id, model_a, model_b, outcome)
      values (?, ?, ?, ?)
    `
  );

  insertVote.run(candidate.test_id, candidate.model_a, candidate.model_b, vote);
  invalidateStoreCaches();
}

export async function getCategories(): Promise<string[]> {
  const cachedValue = getCachedValue(categoriesCache);
  if (cachedValue) {
    return cachedValue;
  }

  if (categoriesCache?.promise) {
    return categoriesCache.promise;
  }

  const promise = (async () => {
    const { summaryRows } = await loadArenaData();
    const categories = [...new Set(summaryRows.map((row) => row.category))]
      .sort((left, right) => left.localeCompare(right));
    categoriesCache = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      value: categories,
    };
    return categories;
  })().catch((error) => {
    categoriesCache = null;
    throw error;
  });

  categoriesCache = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    promise,
  };

  return promise;
}

export async function getLeaderboardRows(category?: string): Promise<LeaderboardRow[]> {
  const cacheKey = getCategoryCacheKey(category);
  return readThroughCache(leaderboardCache, cacheKey, async () => {
    const { summaryRows, votes } = await loadArenaData(category);
    return computeLeaderboardRows(summaryRows, votes);
  });
}

export async function saveBenchmarkUpload(upload: BenchmarkUpload): Promise<number> {
  if (getStorageMode() === "supabase") {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error("Supabase environment variables are missing.");
    }

    const { error: runError } = await supabase.from("runs").upsert({
      run_id: upload.run_id,
      model: upload.model,
      provider: upload.provider,
      benchmark_version: upload.benchmark_version,
      config: upload.config ?? {},
      timestamp: upload.timestamp,
    }, {
      onConflict: "run_id",
    });

    if (runError) {
      throw new Error(runError.message);
    }

    const { error: deleteError } = await supabase.from("test_results").delete().eq("run_id", upload.run_id);
    if (deleteError) {
      throw new Error(deleteError.message);
    }

    if (upload.results.length > 0) {
      const { error: insertError } = await supabase.from("test_results").insert(
        upload.results.map((result) => ({
          run_id: upload.run_id,
          test_id: result.test_id,
          category: result.category,
          summary: result.summary,
          input_tokens: result.input_tokens ?? null,
          output_tokens: result.output_tokens ?? null,
          latency_ms: result.latency_ms ?? null,
        }))
      );

      if (insertError) {
        throw new Error(insertError.message);
      }
    }

    invalidateStoreCaches();
    return upload.results.length;
  }

  const database = await getDatabase();
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
  invalidateStoreCaches();
  return savedResults;
}
