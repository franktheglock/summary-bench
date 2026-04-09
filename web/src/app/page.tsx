"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Loader2, TrendingUp } from "lucide-react";
import { ModelIcon } from "@lobehub/icons";

type LeaderboardRow = {
  model: string;
  provider: string;
  tests: number;
  votes: number;
  win_rate: number;
  avg_latency_ms: number;
  latest_run: string;
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function HomePage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<"elo" | "win_rate">("elo");
  const [activeCategory, setActiveCategory] = useState("all");

  useEffect(() => {
    let mounted = true;

    const loadLeaderboard = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/leaderboard", { cache: "no-store" });
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.error || "Failed to load uploaded benchmark data.");
        }

        if (mounted) {
          setRows(data.rows ?? []);
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load uploaded benchmark data.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadLeaderboard();

    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const totalModels = rows.length;
    const totalVotes = rows.reduce((sum, row) => sum + row.votes, 0);
    const totalTests = rows.reduce((sum, row) => sum + row.tests, 0);
    const avgLatency = totalModels
      ? Math.round(rows.reduce((sum, row) => sum + row.avg_latency_ms, 0) / totalModels)
      : 0;
    const evaluations = totalVotes + totalTests;

    return { totalModels, totalVotes, totalTests, avgLatency, evaluations };
  }, [rows]);

  const categories = ["all", "reasoning", "coding", "writing", "analysis"];

  const chartRows = useMemo(() => {
    return rows
      .slice(0, 6)
      .map((row, index) => ({
        ...row,
        rank: index + 1,
        score:
          metric === "elo"
            ? Math.round(1000 + row.win_rate * 3.4 + row.votes * 0.9)
            : row.win_rate,
      }))
      .sort((left, right) => right.score - left.score);
  }, [metric, rows]);

  const maxScore = chartRows.reduce((maximum, row) => Math.max(maximum, row.score), 0);
  const minScore = chartRows.reduce((minimum, row) => Math.min(minimum, row.score), maxScore || 0);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 fade-in">
      <section className="flex flex-col gap-4 pt-2 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="label">Crowdsourced benchmark</div>
          <h1 className="font-serif text-4xl leading-[0.95] font-semibold tracking-tight text-ink md:text-5xl">
            Summary Arena
          </h1>
          <div className="flex flex-wrap gap-2 pt-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`tab border px-3 py-2 text-xs transition-colors ${
                  activeCategory === category ? "tab-active bg-white" : "bg-transparent"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 text-left md:text-right">
          <div className="label">Updated hourly</div>
          <div className="text-sm text-ink-light">
            {stats.evaluations.toLocaleString()} evaluations
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            <button
              type="button"
              onClick={() => setMetric("elo")}
              className={`tab border px-3 py-2 text-xs transition-colors ${
                metric === "elo" ? "tab-active bg-white" : "bg-transparent"
              }`}
            >
              Elo rating
            </button>
            <button
              type="button"
              onClick={() => setMetric("win_rate")}
              className={`tab border px-3 py-2 text-xs transition-colors ${
                metric === "win_rate" ? "tab-active bg-white" : "bg-transparent"
              }`}
            >
              Win rate
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="panel border-terracotta-light bg-terracotta-light p-4 text-sm text-ink-light">
          {error}
        </div>
      )}

      {loading && (
        <div className="panel flex items-center justify-center gap-3 p-10 text-stone">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading uploaded benchmark data...
        </div>
      )}

      {!loading && rows.length === 0 && !error && (
        <div className="panel p-10 text-stone-light">
          No uploaded benchmark data found yet. Upload a results JSON file to populate the board.
        </div>
      )}

      {chartRows.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="label flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              {metric === "elo" ? "Elo rating" : "Win rate"}
            </div>
            <div className="text-xs uppercase tracking-[0.2em] text-stone-light">Expand ↗</div>
          </div>

          <div className="panel p-4 md:p-6">
            <div className="grid min-h-[270px] grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:gap-4">
              {chartRows.map((row, index) => {
                const palette = ["#C4704B", "#9A815F", "#6B7A3D", "#7F946E", "#B0A08A", "#C0B39D"];
                const base = maxScore - minScore || 1;
                const height = 0.58 + ((row.score - minScore) / base) * 0.34;

                return (
                  <div key={row.model} className="flex h-full flex-col justify-end">
                    <div className="pb-3 text-center text-[11px] font-semibold text-ink">
                      {metric === "elo" ? Math.round(row.score) : `${Math.round(row.score)}%`}
                    </div>
                    <div className="flex flex-1 items-end justify-center">
                      <div
                        className="relative flex w-full max-w-[68px] flex-col justify-end"
                        style={{ height: `${Math.round(height * 100)}%` }}
                      >
                        <div
                          className="relative w-full"
                          style={{ backgroundColor: palette[index % palette.length] }}
                        >
                          <div className="aspect-[0.82/1] w-full" />
                        </div>
                      </div>
                    </div>
                    <div className="pt-3 text-center">
                      <div className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-paper-dark">
                        <ModelIcon model={row.model} size={14} />
                      </div>
                      <div className="mt-2 truncate text-[10px] leading-4 text-ink-light">
                        {row.model}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <div className="flex justify-center pt-2">
        <a href="/arena" className="btn-primary inline-flex items-center gap-2 text-sm">
          Enter arena
          <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
        </a>
      </div>
    </div>
  );
}