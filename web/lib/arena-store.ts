import { getDatabase } from "@/lib/db";
import { getSupabaseClient, hasSupabaseConfig, hasSupabaseServiceRole } from "@/lib/supabase";
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
  verified?: boolean;
};

export type ModelVerificationRecord = {
  model: string;
  provider: string;
  verified_by: string | null;
  verified_by_user_id: string | null;
  verified_at: string;
};

export type ModerationModelRow = LeaderboardRow & {
  verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
};

type SummaryRow = {
  model: string;
  provider: string;
  summary: string;
  test_id: string;
  category: string;
  source_text: string | null;
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

async function getDatasetSourceTexts(): Promise<Map<string, string>> {
  if (!datasetTestCasesPromise) {
    datasetTestCasesPromise = loadDatasetTestCases();
  }

  return datasetTestCasesPromise;
}

function isNonEmptySummary(summary: string): boolean {
  return summary.trim().length > 0;
}

function compareTimestampsDescending(left: string, right: string): number {
  return new Date(right).getTime() - new Date(left).getTime();
}

function buildModelProviderKey(model: string, provider: string): string {
  return `${model.trim().toLowerCase()}::${provider.trim().toLowerCase()}`;
}

function isMissingSupabaseRelation(error: { message?: string } | null | undefined, relationName: string): boolean {
  const message = error?.message?.toLowerCase();
  if (!message) {
    return false;
  }

  return message.includes("does not exist") && message.includes(`public.${relationName}`);
}

function withVerificationFlag<T extends { model: string; provider: string }>(
  rows: T[],
  verificationMap: Map<string, ModelVerificationRecord>
): Array<T & { verified: boolean }> {
  return rows.map((row) => ({
    ...row,
    verified: verificationMap.has(buildModelProviderKey(row.model, row.provider)),
  }));
}

async function loadSqliteModelVerificationRecords(): Promise<ModelVerificationRecord[]> {
  const database = await getDatabase();

  return database
    .prepare(
      `
        select
          model,
          provider,
          verified_by,
          verified_by_user_id,
          verified_at
        from model_verifications
      `
    )
    .all() as ModelVerificationRecord[];
}

async function loadSupabaseModelVerificationRecords(): Promise<ModelVerificationRecord[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase environment variables are missing.");
  }

  const { data, error } = await supabase
    .from("model_verifications")
    .select("model, provider, verified_by, verified_by_user_id, verified_at");

  if (error) {
    if (isMissingSupabaseRelation(error, "model_verifications")) {
      return [];
    }

    throw new Error(error.message);
  }

  return (data ?? []) as ModelVerificationRecord[];
}

async function getModelVerificationRecords(): Promise<ModelVerificationRecord[]> {
  return getStorageMode() === "supabase"
    ? loadSupabaseModelVerificationRecords()
    : loadSqliteModelVerificationRecords();
}

async function getModelVerificationMap(): Promise<Map<string, ModelVerificationRecord>> {
  const records = await getModelVerificationRecords();
  return new Map(records.map((record) => [buildModelProviderKey(record.model, record.provider), record]));
}

async function getDistinctUploadedModels(): Promise<Array<{ model: string; provider: string }>> {
  if (getStorageMode() === "supabase") {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error("Supabase environment variables are missing.");
    }

    const { data, error } = await supabase.from("runs").select("model, provider");
    if (error) {
      throw new Error(error.message);
    }

    const distinct = new Map<string, { model: string; provider: string }>();
    for (const row of data ?? []) {
      distinct.set(buildModelProviderKey(row.model, row.provider), row);
    }

    return [...distinct.values()];
  }

  const database = await getDatabase();
  return database
    .prepare(
      `
        select distinct
          model,
          provider
        from runs
      `
    )
    .all() as Array<{ model: string; provider: string }>;
}

function computeVoteCandidate(summaryRows: SummaryRow[], votes: VoteRow[]): VoteCandidate | null {
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
    source_text: selectedPair[0].source_text || selectedPair[1].source_text || "",
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
    const baseK = 32;
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
      
      const rawElo = ratings.get(row.model) ?? BASE_RATING;
      // Bayesian Smoothing (Shrinkage) to prevent lucky low-vote models from hitting Rank 1
      const smoothingFactor = appearanceCount / (appearanceCount + 20);
      const smoothedElo = Math.round(BASE_RATING + (rawElo - BASE_RATING) * smoothingFactor);

      return {
        model: row.model,
        provider: row.provider,
        tests: row.tests,
        votes: Math.round(appearanceCount),
        win_rate,
        avg_latency_ms: row.tests > 0 ? Math.round(row.latencySum / row.tests) : 0,
        latest_run: row.latest_run,
        elo: smoothedElo,
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
          tr.source_text as source_text,
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
    .select("run_id, test_id, category, source_text, summary, latency_ms");

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
      source_text: row.source_text,
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

export async function getVoteCandidate(
  category?: string,
  options?: { excludeTestId?: string }
): Promise<VoteCandidate | null> {
  const { summaryRows, votes } = await loadArenaData(category);
  const candidate = computeVoteCandidate(summaryRows, votes);

  if (!candidate) {
    return null;
  }

  if (options?.excludeTestId && candidate.test_id === options.excludeTestId) {
    const alternativeRows = summaryRows.filter((row) => row.test_id !== options.excludeTestId);
    const alternativeCandidate = computeVoteCandidate(alternativeRows, votes);

    if (!alternativeCandidate) {
      return null;
    }

    return {
      ...alternativeCandidate,
      source_text: alternativeCandidate.source_text || await getSourceText(alternativeCandidate.test_id),
    };
  }

  return {
    ...candidate,
    source_text: candidate.source_text || await getSourceText(candidate.test_id),
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
    const [{ summaryRows, votes }, verificationMap] = await Promise.all([
      loadArenaData(category),
      getModelVerificationMap(),
    ]);
    return withVerificationFlag(computeLeaderboardRows(summaryRows, votes), verificationMap);
  });
}

export type ModelCategoryStat = LeaderboardRow & { category: string; rank: number; totalModels: number };

export async function getModelStats(modelName: string): Promise<ModelCategoryStat[]> {
  const [{ summaryRows, votes }, verificationMap] = await Promise.all([
    loadArenaData(),
    getModelVerificationMap(),
  ]);
  const modelKey = modelName.toLowerCase();
  const categories = [...new Set(summaryRows.map((row) => row.category))].sort((left, right) => left.localeCompare(right));
  const allCategories = ["all", ...categories];
  const leaderboardByCategory = new Map<string, LeaderboardRow[]>();

  leaderboardByCategory.set("all", withVerificationFlag(computeLeaderboardRows(summaryRows, votes), verificationMap));

  for (const category of categories) {
    const categoryRows = summaryRows.filter((row) => row.category === category);
    const testIds = new Set(categoryRows.map((row) => row.test_id));
    const categoryVotes = votes.filter((vote) => testIds.has(vote.test_id));
    leaderboardByCategory.set(
      category,
      withVerificationFlag(computeLeaderboardRows(categoryRows, categoryVotes), verificationMap)
    );
  }

  const stats: ModelCategoryStat[] = [];

  for (const category of allCategories) {
    const rows = leaderboardByCategory.get(category) ?? [];
    const index = rows.findIndex((row) => row.model.toLowerCase() === modelKey);

    if (index !== -1) {
      stats.push({
        ...rows[index],
        category,
        rank: index + 1,
        totalModels: rows.length,
      });
    }
  }

  return stats;
}

export async function getModerationModels(): Promise<ModerationModelRow[]> {
  const [rows, verificationMap] = await Promise.all([
    getLeaderboardRows(),
    getModelVerificationMap(),
  ]);

  return rows.map((row) => {
    const verification = verificationMap.get(buildModelProviderKey(row.model, row.provider));
    return {
      ...row,
      verified: Boolean(verification),
      verified_at: verification?.verified_at ?? null,
      verified_by: verification?.verified_by ?? null,
    };
  });
}

export async function setModelVerification(input: {
  model: string;
  provider: string;
  verified: boolean;
  verifiedBy: string;
  verifiedByUserId: string;
}): Promise<ModelVerificationRecord | null> {
  const normalized = {
    model: input.model.trim(),
    provider: input.provider.trim(),
  };

  if (getStorageMode() === "supabase") {
    if (!hasSupabaseServiceRole()) {
      throw new Error("Supabase service role is required for moderator verification writes.");
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error("Supabase environment variables are missing.");
    }

    if (!input.verified) {
      const { error } = await supabase
        .from("model_verifications")
        .delete()
        .eq("model", normalized.model)
        .eq("provider", normalized.provider);

      if (error) {
        throw new Error(error.message);
      }

      invalidateStoreCaches();
      return null;
    }

    const verification = {
      model: normalized.model,
      provider: normalized.provider,
      verified_by: input.verifiedBy,
      verified_by_user_id: input.verifiedByUserId,
      verified_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("model_verifications")
      .upsert(verification, { onConflict: "model,provider" })
      .select("model, provider, verified_by, verified_by_user_id, verified_at")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    invalidateStoreCaches();
    return data as ModelVerificationRecord;
  }

  const database = await getDatabase();

  if (!input.verified) {
    database
      .prepare("delete from model_verifications where model = ? and provider = ?")
      .run(normalized.model, normalized.provider);
    invalidateStoreCaches();
    return null;
  }

  const verifiedAt = new Date().toISOString();

  database
    .prepare(
      `
        insert into model_verifications (
          model,
          provider,
          verified_by,
          verified_by_user_id,
          verified_at
        ) values (?, ?, ?, ?, ?)
        on conflict(model, provider) do update set
          verified_by = excluded.verified_by,
          verified_by_user_id = excluded.verified_by_user_id,
          verified_at = excluded.verified_at
      `
    )
    .run(normalized.model, normalized.provider, input.verifiedBy, input.verifiedByUserId, verifiedAt);

  invalidateStoreCaches();
  return {
    model: normalized.model,
    provider: normalized.provider,
    verified_by: input.verifiedBy,
    verified_by_user_id: input.verifiedByUserId,
    verified_at: verifiedAt,
  };
}

export async function verifyAllModels(input: {
  verifiedBy: string;
  verifiedByUserId: string;
}): Promise<{ count: number; verified_at: string; verified_by: string }> {
  const verifiedAt = new Date().toISOString();
  const models = await getDistinctUploadedModels();

  if (getStorageMode() === "supabase") {
    if (!hasSupabaseServiceRole()) {
      throw new Error("Supabase service role is required for moderator verification writes.");
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error("Supabase environment variables are missing.");
    }

    if (models.length > 0) {
      const { error } = await supabase.from("model_verifications").upsert(
        models.map((row) => ({
          model: row.model,
          provider: row.provider,
          verified_by: input.verifiedBy,
          verified_by_user_id: input.verifiedByUserId,
          verified_at: verifiedAt,
        })),
        { onConflict: "model,provider" }
      );

      if (error) {
        throw new Error(error.message);
      }
    }

    invalidateStoreCaches();
    return { count: models.length, verified_at: verifiedAt, verified_by: input.verifiedBy };
  }

  const database = await getDatabase();
  const upsert = database.prepare(
    `
      insert into model_verifications (
        model,
        provider,
        verified_by,
        verified_by_user_id,
        verified_at
      ) values (?, ?, ?, ?, ?)
      on conflict(model, provider) do update set
        verified_by = excluded.verified_by,
        verified_by_user_id = excluded.verified_by_user_id,
        verified_at = excluded.verified_at
    `
  );

  const transaction = database.transaction((rows: Array<{ model: string; provider: string }>) => {
    for (const row of rows) {
      upsert.run(row.model, row.provider, input.verifiedBy, input.verifiedByUserId, verifiedAt);
    }
  });

  transaction(models);
  invalidateStoreCaches();
  return { count: models.length, verified_at: verifiedAt, verified_by: input.verifiedBy };
}

export async function saveBenchmarkUpload(upload: BenchmarkUpload, uploaderId?: string | null): Promise<number> {
  const datasetSourceTexts = await getDatasetSourceTexts();

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
      ...(uploaderId ? { uploader_id: uploaderId } : {}),
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
          source_text: result.source_text ?? datasetSourceTexts.get(result.test_id) ?? null,
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
        timestamp,
        uploader_id
      ) values (?, ?, ?, ?, ?, ?, ?)
      on conflict(run_id) do update set
        model = excluded.model,
        provider = excluded.provider,
        benchmark_version = excluded.benchmark_version,
        config = excluded.config,
        timestamp = excluded.timestamp,
        uploader_id = coalesce(excluded.uploader_id, runs.uploader_id)
    `
  );
  const deleteResults = database.prepare("delete from test_results where run_id = ?");
  const upsertResult = database.prepare(
    `
      insert into test_results (
        run_id,
        test_id,
        category,
        source_text,
        summary,
        input_tokens,
        output_tokens,
        latency_ms
      ) values (?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(run_id, test_id) do update set
        category = excluded.category,
        source_text = excluded.source_text,
        summary = excluded.summary,
        input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens,
        latency_ms = excluded.latency_ms
    `
  );

  const persistUpload = database.transaction((currentUpload: BenchmarkUpload, uid: string | null) => {
    upsertRun.run(
      currentUpload.run_id,
      currentUpload.model,
      currentUpload.provider,
      currentUpload.benchmark_version,
      JSON.stringify(currentUpload.config ?? {}),
      currentUpload.timestamp,
      uid ?? null
    );

    deleteResults.run(currentUpload.run_id);

    for (const result of currentUpload.results) {
      upsertResult.run(
        currentUpload.run_id,
        result.test_id,
        result.category,
        result.source_text ?? datasetSourceTexts.get(result.test_id) ?? null,
        result.summary,
        result.input_tokens ?? null,
        result.output_tokens ?? null,
        result.latency_ms ?? null
      );
    }

    return currentUpload.results.length;
  });

  const savedResults = persistUpload(upload, uploaderId ?? null);
  invalidateStoreCaches();
  return savedResults;
}

export type UploaderRun = {
  run_id: string;
  model: string;
  provider: string;
  benchmark_version: string;
  timestamp: string;
  result_count: number;
};

export async function getRunsByUploader(uploaderId: string): Promise<UploaderRun[]> {
  if (getStorageMode() === "supabase") {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("runs")
      .select("run_id, model, provider, benchmark_version, timestamp, test_results(count)")
      .eq("uploader_id", uploaderId)
      .order("timestamp", { ascending: false });

    if (error || !data) return [];

    return data.map((row) => ({
      run_id: row.run_id,
      model: row.model,
      provider: row.provider,
      benchmark_version: row.benchmark_version,
      timestamp: row.timestamp,
      result_count: (row.test_results as unknown as { count: number }[])?.[0]?.count ?? 0,
    }));
  }

  const database = await getDatabase();
  const rows = database.prepare(
    `select r.run_id, r.model, r.provider, r.benchmark_version, r.timestamp,
            count(tr.id) as result_count
     from runs r
     left join test_results tr on tr.run_id = r.run_id
     where r.uploader_id = ?
     group by r.run_id
     order by r.timestamp desc`
  ).all(uploaderId) as UploaderRun[];

  return rows;
}
