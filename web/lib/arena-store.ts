import fs from "node:fs";
import path from "node:path";

import { getDatabase } from "@/lib/db";

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
};

type SummaryRow = {
  model: string;
  provider: string;
  summary: string;
  test_id: string;
  category: string;
  run_id: string;
  timestamp: string;
};

type DatasetTestCase = {
  test_id: string;
  input_text: string;
};

const DATASET_TEST_CASES = loadDatasetTestCases();

function loadDatasetTestCases(): Map<string, string> {
  const datasetPath = path.resolve(process.cwd(), "..", "datasets", "v1", "test_cases.json");

  try {
    const raw = fs.readFileSync(datasetPath, "utf8");
    const parsed = JSON.parse(raw) as DatasetTestCase[];
    return new Map(parsed.map((testCase) => [testCase.test_id, testCase.input_text]));
  } catch {
    return new Map();
  }
}

function getSourceText(testId: string): string {
  return DATASET_TEST_CASES.get(testId) || "";
}

export function getVoteCandidate(category?: string): VoteCandidate | null {
  const database = getDatabase();

  const categoryFilter = category && category !== "all"
    ? "and tr.category = ?"
    : "";
  const params = category && category !== "all" ? [category] : [];

  const testRow = database
    .prepare(
      `
        select tr.test_id as test_id, tr.category as category, count(distinct r.model) as model_count
        from test_results tr
        join runs r on r.run_id = tr.run_id
        where coalesce(trim(tr.summary), '') <> ''
          and not exists (
            select 1 from votes v where v.test_id = tr.test_id
          )
          ${categoryFilter}
        group by tr.test_id, tr.category
        having count(distinct r.model) >= 2
        order by model_count desc, tr.test_id asc
        limit 1
      `
    )
    .get(...params) as { test_id: string; category: string } | undefined;

  if (!testRow) {
    return null;
  }

  const rows = database
    .prepare(
      `
        select
          r.model as model,
          r.provider as provider,
          tr.summary as summary,
          tr.test_id as test_id,
          tr.category as category,
          tr.run_id as run_id,
          r.timestamp as timestamp
        from test_results tr
        join runs r on r.run_id = tr.run_id
        where tr.test_id = ?
          and coalesce(trim(tr.summary), '') <> ''
        order by datetime(r.timestamp) desc, tr.id desc
      `
    )
    .all(testRow.test_id) as SummaryRow[];

  const distinctModels = new Map<string, SummaryRow>();
  for (const row of rows) {
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
    test_id: testRow.test_id,
    category: testRow.category,
    source_text: getSourceText(testRow.test_id),
    model_a: selectedPair[0].model,
    provider_a: selectedPair[0].provider,
    summary_a: selectedPair[0].summary,
    model_b: selectedPair[1].model,
    provider_b: selectedPair[1].provider,
    summary_b: selectedPair[1].summary,
  };
}

export function recordVote(candidate: VoteCandidate, vote: VoteChoice): void {
  const database = getDatabase();

  const insertVote = database.prepare(
    `
      insert into votes (test_id, model_a, model_b, outcome)
      values (?, ?, ?, ?)
    `
  );

  insertVote.run(candidate.test_id, candidate.model_a, candidate.model_b, vote);
}

export function getCategories(): string[] {
  const database = getDatabase();
  
  const rows = database
    .prepare(
      `
        select distinct category
        from test_results
        where coalesce(trim(summary), '') <> ''
        order by category
      `
    )
    .all() as Array<{ category: string }>;
  
  return rows.map((row) => row.category);
}

export function getLeaderboardRows(category?: string): LeaderboardRow[] {
  const database = getDatabase();

  const categoryFilter = category && category !== "all" ? "and tr.category = ?" : "";
  const params = category && category !== "all" ? [category] : [];

  const testStats = database
    .prepare(
      `
        select
          r.model as model,
          r.provider as provider,
          count(*) as tests,
          avg(coalesce(tr.latency_ms, 0)) as avg_latency_ms,
          max(r.timestamp) as latest_run
        from runs r
        join test_results tr on tr.run_id = r.run_id
        where coalesce(trim(tr.summary), '') <> ''
          ${categoryFilter}
        group by r.model, r.provider
      `
    )
    .all(...params) as Array<{
    model: string;
    provider: string;
    tests: number;
    avg_latency_ms: number;
    latest_run: string;
  }>;

  // Build WHERE clause for vote filtering
  const hasCategoryFilter = category && category !== "all";
  const categoryCheck = hasCategoryFilter
    ? "and exists (select 1 from test_results tr where tr.test_id = v.test_id and tr.category = ?)"
    : "";
  // We need 6 parameter values (4 for vote_rows unions + 2 for appearance_rows unions)
  const voteParams = hasCategoryFilter ? Array(6).fill(category) : [];

  const voteStats = database
    .prepare(
      `
        with vote_rows as (
          select v.model_a as model, 1 as score
          from votes v
          where v.outcome = 'a' ${categoryCheck}

          union all

          select v.model_b as model, 1 as score
          from votes v
          where v.outcome = 'b' ${categoryCheck}

          union all

          select v.model_a as model, 0.5 as score
          from votes v
          where v.outcome = 'tie' ${categoryCheck}

          union all

          select v.model_b as model, 0.5 as score
          from votes v
          where v.outcome = 'tie' ${categoryCheck}
        ),
        appearance_rows as (
          select v.model_a as model, 1 as appearance_count 
          from votes v
          where 1=1 ${categoryCheck}
          union all
          select v.model_b as model, 1 as appearance_count 
          from votes v
          where 1=1 ${categoryCheck}
        ),
        vote_summary as (
          select model, sum(score) as score
          from vote_rows
          group by model
        ),
        appearance_summary as (
          select model, sum(appearance_count) as appearance_count
          from appearance_rows
          group by model
        )
        select
          a.model as model,
          coalesce(v.score, 0) as score,
          a.appearance_count as appearance_count
        from appearance_summary a
        left join vote_summary v on v.model = a.model
      `
    )
    .all(...voteParams) as Array<{
    model: string;
    score: number;
    appearance_count: number;
  }>;

  const voteByModel = new Map(
    voteStats.map((row) => [row.model, { score: row.score, appearance_count: row.appearance_count }])
  );

  return testStats
    .map((row) => {
      const votes = voteByModel.get(row.model);
      const voteCount = votes?.score ?? 0;
      const appearanceCount = votes?.appearance_count ?? 0;
      const score = votes?.score ?? 0;
      const win_rate = appearanceCount > 0 ? Math.round((score / appearanceCount) * 100) : 0;

      return {
        model: row.model,
        provider: row.provider,
        tests: row.tests,
        votes: Math.round(voteCount),
        win_rate,
        avg_latency_ms: Math.round(row.avg_latency_ms ?? 0),
        latest_run: row.latest_run,
      };
    })
    .sort((left, right) => {
      if (right.win_rate !== left.win_rate) {
        return right.win_rate - left.win_rate;
      }

      if (right.tests !== left.tests) {
        return right.tests - left.tests;
      }

      return left.model.localeCompare(right.model);
    });
}
