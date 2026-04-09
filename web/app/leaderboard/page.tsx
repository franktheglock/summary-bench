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

  // Calculate ELO scores with confidence weighting
  const rowsWithElo = useMemo(() => {
    return rows.map((row) => {
      // Same formula as homepage
      const confidenceFactor = row.votes > 0
        ? 100 * (1 - Math.exp(-row.votes / 30))
        : 0;
      const eloScore = Math.round(1000 + (row.win_rate / 100) * confidenceFactor);
      
      return {
        ...row,
        elo: eloScore,
      };
    }).sort((a, b) => b.elo - a.elo);
  }, [rows]);

  const maxElo = useMemo(() => {
    return Math.max(...rowsWithElo.map((row) => row.elo), 1000);
  }, [rowsWithElo]);

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
      <div className="border-b border-border">
        <div className="flex gap-1 flex-wrap">
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
        {rowsWithElo.map((model, idx) => {
          const displayValue = metric === "elo" ? model.elo : model.win_rate;
          const maxValue = metric === "elo" ? maxElo : maxWinRate;
          const barWidth = maxValue > 0 ? (displayValue / maxValue) * 100 : 0;
          
          return (
            <motion.div
              key={model.model}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05, duration: 0.3 }}
              className="panel flex items-center gap-4 p-4 hover:border-terracotta transition-colors"
            >
              {/* Rank */}
              <div className="w-10 shrink-0">
                <span className={`inline-flex items-center justify-center w-8 h-8 text-sm font-bold
                  ${idx === 0 ? 'bg-terracotta text-white' :
                    idx === 1 ? 'bg-ink-light text-white' :
                    idx === 2 ? 'bg-stone text-white' :
                    'bg-paper-dark text-stone'}
                `}>
                  {idx + 1}
                </span>
              </div>

              {/* Icon */}
              <div className="w-10 h-10 flex items-center justify-center shrink-0">
                <ModelIcon model={model.model} size={32} />
              </div>

              {/* Model Info */}
              <div className="w-40 shrink-0">
                <h3 className="font-semibold text-ink text-sm leading-tight">{model.model}</h3>
                <span className="text-stone text-xs capitalize">{model.provider}</span>
              </div>

              {/* Stats */}
              <div className="flex-1 flex items-center gap-8">
                {/* ELO */}
                <div className="w-24 shrink-0">
                  <span className="label block mb-1">ELO</span>
                  <span className="font-mono font-semibold text-ink text-base">{model.elo.toLocaleString()}</span>
                </div>

                {/* Win Rate with Bar */}
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="label">{metric === "elo" ? "ELO Score" : "Win Rate"}</span>
                    <span className="font-mono text-ink text-sm">
                      {metric === "elo" ? model.elo.toLocaleString() : `${model.win_rate}%`}
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

                {/* Votes */}
                <div className="w-20 text-right shrink-0">
                  <span className="label block mb-1">Votes</span>
                  <span className="font-mono text-stone text-sm">{model.votes.toLocaleString()}</span>
                </div>

                {/* Tests */}
                <div className="w-20 text-right shrink-0">
                  <span className="label block mb-1">Tests</span>
                  <span className="font-mono text-stone text-sm">{model.tests.toLocaleString()}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}