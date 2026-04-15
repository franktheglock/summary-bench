"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { ModelIcon } from "@lobehub/icons";

type LeaderboardRow = {
  model: string;
  provider: string;
  tests: number;
  votes: number;
  win_rate: number;
  avg_latency_ms: number;
  latest_run: string;
  elo?: number;
};

// Category display names mapping
const CATEGORY_LABELS: Record<string, string> = {
  all: "All",
  news: "News",
  code: "Code",
  legal: "Legal",
  scientific: "Scientific",
  agentic: "Agentic",
  meeting: "Meeting",
  reviews: "Reviews",
};

export default function LeaderboardPage() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [metric, setMetric] = useState<"elo" | "winRate">("elo");
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadLeaderboard = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/leaderboard?category=${encodeURIComponent(activeCategory)}`,
          { cache: "no-store" }
        );
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.error || "Failed to load leaderboard data.");
        }

        if (mounted) {
          setRows(data.rows ?? []);
          if (activeCategory === "all") {
            setCategories(data.categories ?? []);
          }
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load leaderboard.");
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
  }, [activeCategory]);

  const availableCategories = useMemo(() => {
    return ["all", ...categories];
  }, [categories]);

  // Sort rows by ELO score (smoothed Elo from backend)
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
  }, [rows]);

  const maxElo = useMemo(() => {
    return Math.max(...sortedRows.map((row) => row.elo ?? 1000), 1000);
  }, [sortedRows]);

  const maxWinRate = 100;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <p className="label mb-2">Global Rankings</p>
          <h1 className="font-serif text-4xl md:text-5xl font-semibold tracking-tight text-ink">
            Leaderboard
          </h1>
        </div>
        <div className="text-right">
          <p className="text-xs text-stone-light uppercase tracking-wider">Updated hourly</p>
          <p className="text-sm text-stone mt-1">{rows.length.toLocaleString()} models loaded</p>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="border-b border-border overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
        <div className="flex gap-1 whitespace-nowrap min-w-max md:flex-wrap md:min-w-0">
          {availableCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 -mb-px
                ${cat === activeCategory
                  ? "border-terracotta text-ink"
                  : "border-transparent text-stone hover:text-ink hover:border-border"}
              `}
            >
              {CATEGORY_LABELS[cat] || cat}
            </button>
          ))}
        </div>
      </div>

      {/* Metric Toggle */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-1 bg-paper-dark p-1">
          <button
            onClick={() => setMetric("elo")}
            className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all
              ${metric === "elo" ? "bg-white text-ink shadow-sm" : "text-stone hover:text-ink"}
            `}
          >
            ELO Rating
          </button>
          <button
            onClick={() => setMetric("winRate")}
            className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all
              ${metric === "winRate" ? "bg-white text-ink shadow-sm" : "text-stone hover:text-ink"}
            `}
          >
            Win Rate
          </button>
        </div>
      </div>

      {error && (
        <div className="panel border-terracotta-light bg-terracotta-light p-4 text-sm text-ink-light">
          {error}
        </div>
      )}

      {loading && (
        <div className="panel p-10 flex items-center justify-center gap-3 text-stone">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading uploaded runs and votes...
        </div>
      )}

      {/* Leaderboard List */}
      <div className="space-y-3">
        {sortedRows.map((model, idx) => {
          const displayValue = metric === "elo" ? (model.elo ?? 0) : model.win_rate;
          const maxValue = metric === "elo" ? maxElo : maxWinRate;
          const barWidth = maxValue > 0 ? (displayValue / maxValue) * 100 : 0;
          const rankClass = idx === 0 ? 'bg-terracotta text-white' :
            idx === 1 ? 'bg-ink-light text-white' :
            idx === 2 ? 'bg-stone text-white' :
            'bg-paper-dark text-stone';
          
          const isProvisional = model.votes < 20;

          return (
            <motion.div
              key={model.model}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: isProvisional ? 0.6 : 1, x: 0 }}
              transition={{ delay: idx * 0.05, duration: 0.3 }}
              className={`panel p-4 transition-colors ${isProvisional ? 'hover:opacity-100 border-transparent hover:border-border' : 'hover:border-terracotta'}`}
            >
              {/* Mobile layout */}
              <div className="flex items-center gap-3 md:hidden">
                <span className={`inline-flex items-center justify-center w-7 h-7 text-xs font-bold shrink-0 ${rankClass}`}>
                  {idx + 1}
                </span>
                <div className="w-8 h-8 flex items-center justify-center shrink-0">
                  <ModelIcon model={model.model} size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-ink text-sm flex items-center gap-1.5 leading-tight truncate">
                    {model.model}
                    {isProvisional && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-stone-100 text-stone-500 border border-stone-200" title="Provisional Score (Needs more votes)">
                        Prov
                      </span>
                    )}
                  </h3>
                  <span className="text-stone text-xs capitalize">{model.provider}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono font-semibold text-ink">{(model.elo ?? 0).toLocaleString()}</span>
                  <span className="block text-[10px] text-stone-light uppercase tracking-wide">ELO</span>
                </div>
              </div>
              <div className="mt-2.5 md:hidden">
                <div className="flex justify-between text-xs mb-1">
                  <span className="label">{metric === "elo" ? "ELO Score" : "Win Rate"}</span>
                  <span className="font-mono text-ink">
                    {metric === "elo" ? (model.elo ?? 0).toLocaleString() : `${model.win_rate}%`}
                  </span>
                </div>
                <div className="h-1.5 bg-paper-dark overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${barWidth}%` }}
                    transition={{ delay: idx * 0.1, duration: 0.5 }}
                    className="h-full bg-terracotta"
                  />
                </div>
                <div className="flex gap-4 mt-2 text-xs text-stone-light font-mono">
                  <span>{model.votes.toLocaleString()} votes</span>
                  <span>{model.tests.toLocaleString()} tests</span>
                </div>
              </div>

              {/* Desktop layout */}
              <div className="hidden md:flex items-center gap-4">
                <div className="w-10 shrink-0">
                  <span className={`inline-flex items-center justify-center w-8 h-8 text-sm font-bold ${rankClass}`}>
                    {idx + 1}
                  </span>
                </div>
                <div className="w-10 h-10 flex items-center justify-center shrink-0">
                  <ModelIcon model={model.model} size={32} />
                </div>
                <div className="w-40 shrink-0">
                  <h3 className="font-semibold text-ink text-sm flex items-center gap-1.5 leading-tight truncate">
                    {model.model}
                    {isProvisional && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-stone-100 text-stone-500 border border-stone-200" title="Provisional Score (Needs more votes)">
                        Prov
                      </span>
                    )}
                  </h3>
                  <span className="text-stone text-xs capitalize">{model.provider}</span>
                </div>
                <div className="flex-1 flex items-center gap-8">
                  <div className="w-24 shrink-0">
                    <span className="label block mb-1">ELO</span>
                    <span className="font-mono font-semibold text-ink text-base">{(model.elo ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="label">{metric === "elo" ? "ELO Score" : "Win Rate"}</span>
                      <span className="font-mono text-ink text-sm">
                        {metric === "elo" ? (model.elo ?? 0).toLocaleString() : `${model.win_rate}%`}
                      </span>
                    </div>
                    <div className="h-2 bg-paper-dark overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${barWidth}%` }}
                        transition={{ delay: idx * 0.1, duration: 0.5 }}
                        className="h-full bg-terracotta"
                      />
                    </div>
                  </div>
                  <div className="w-20 text-right shrink-0">
                    <span className="label block mb-1">Votes</span>
                    <span className="font-mono text-stone text-sm">{model.votes.toLocaleString()}</span>
                  </div>
                  <div className="w-20 text-right shrink-0">
                    <span className="label block mb-1">Tests</span>
                    <span className="font-mono text-stone text-sm">{model.tests.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}