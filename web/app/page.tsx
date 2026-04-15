"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Loader2 } from "lucide-react";
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

const BAR_COLORS = [
  "#C4704B",
  "#8B7355", 
  "#6B7A3D",
  "#7A8F6E",
  "#A69580",
  "#B5AA98",
];

export default function HomePage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<"elo" | "win_rate">("elo");
  const [activeCategory, setActiveCategory] = useState("all");

  // Fetch data when category changes
  useEffect(() => {
    let mounted = true;

    const loadLeaderboard = async () => {
      setLoading(true);
      setError(null);

      try {
        const url = `/api/leaderboard?category=${encodeURIComponent(activeCategory)}`;
        console.log("Fetching:", url); // Debug log
        
        const response = await fetch(url, { cache: "no-store" });
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.error || "Failed to load benchmark data.");
        }

        console.log("Received data:", data); // Debug log

        if (mounted) {
          setRows(data.rows ?? []);
          // Only update categories on initial load (all) to keep tabs stable
          if (activeCategory === "all") {
            setCategories(data.categories ?? []);
          }
        }
      } catch (loadError) {
        console.error("Load error:", loadError); // Debug log
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load data.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadLeaderboard();

    return () => {
      mounted = false;
    };
  }, [activeCategory]);

  const stats = useMemo(() => {
    const totalModels = rows.length;
    const totalVotes = rows.reduce((sum, row) => sum + row.votes, 0);
    const totalTests = rows.reduce((sum, row) => sum + row.tests, 0);
    const evaluations = totalVotes + totalTests;

    return { totalModels, evaluations };
  }, [rows]);

  const availableCategories = useMemo(() => {
    return ["all", ...categories];
  }, [categories]);

  const chartRows = useMemo(() => {
    return rows
      .slice(0, 11)
      .map((row) => {
        // Prefer server-provided Elo when available, otherwise fall back to the
        // previous confidence-shaped heuristic for backward compatibility.
        const confidenceFactor = row.votes > 0
          ? 100 * (1 - Math.exp(-row.votes / 30))
          : 0;
        const fallbackElo = Math.round(1000 + (row.win_rate / 100) * confidenceFactor);
        const eloScore = typeof row.elo === "number" ? row.elo : fallbackElo;

        return {
          ...row,
          score: metric === "elo" ? eloScore : row.win_rate,
          displayValue: metric === "elo"
            ? eloScore.toString()
            : `${Math.round(row.win_rate)}%`,
        };
      })
      .sort((left, right) => right.score - left.score)
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }, [metric, rows]);

  const maxScore = chartRows.reduce((maximum, row) => Math.max(maximum, row.score), 0);

  const handleCategoryClick = (cat: string) => {
    console.log("Category clicked:", cat); // Debug log
    setActiveCategory(cat);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start">
        <div>
          <p className="label mb-2">Crowdsourced Benchmark</p>
          <h1 className="font-serif text-4xl md:text-5xl font-semibold tracking-tight text-ink">
            Summary Arena
          </h1>
        </div>
        <div className="sm:text-right">
          <p className="text-xs text-stone-light uppercase tracking-wider">Updated hourly</p>
          <p className="text-sm text-stone mt-1">{stats.evaluations.toLocaleString()} evaluations</p>
        </div>
      </div>

      {/* Category Chips */}
      <div className="flex gap-2 flex-wrap">
        {availableCategories.map((cat) => (
          <button
            key={cat}
            onClick={() => handleCategoryClick(cat)}
            disabled={loading}
            className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all border
              ${cat === activeCategory
                ? "bg-ink text-paper border-ink"
                : "bg-transparent text-stone border-border hover:border-ink hover:text-ink"}
              ${loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            `}
          >
            {CATEGORY_LABELS[cat] || cat}
          </button>
        ))}
      </div>

      {/* Metric Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-paper-dark p-1">
          <button
            onClick={() => setMetric("elo")}
            disabled={loading}
            className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all
              ${metric === "elo" ? "bg-white text-ink shadow-sm" : "text-stone hover:text-ink"}
              ${loading ? "opacity-50" : ""}
            `}
          >
            ELO Rating
          </button>
          <button
            onClick={() => setMetric("win_rate")}
            disabled={loading}
            className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all
              ${metric === "win_rate" ? "bg-white text-ink shadow-sm" : "text-stone hover:text-ink"}
              ${loading ? "opacity-50" : ""}
            `}
          >
            Win Rate
          </button>
        </div>
        <button className="text-xs text-stone hover:text-ink flex items-center gap-1 uppercase tracking-wider">
          Expand <ArrowUpRight className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* Loading indicator */}
      {loading && (
        <div className="flex items-center justify-center gap-2 text-stone py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      )}

      {/* Bar Chart */}
      {!loading && chartRows.length > 0 ? (
        <div className="panel py-8 overflow-x-auto -mx-4 md:mx-0">
          <div className="px-4 md:px-8 min-w-max mx-auto">
            <div 
              className="flex items-end gap-6" 
              style={{ height: "420px" }}
            >
              {chartRows.map((row, idx) => {
                const barHeight = maxScore > 0 ? (row.score / maxScore) * 100 : 15;
                const barColor = BAR_COLORS[Math.min(idx, BAR_COLORS.length - 1)];
                
                return (
                  <div
                    key={row.model}
                    className="flex flex-col items-center gap-3"
                    style={{ width: "80px" }}
                  >
                    {/* Value Label */}
                    <span className="text-xs font-mono font-semibold text-ink text-center h-5">
                      {row.displayValue}
                    </span>
                    
                    {/* Bar Container */}
                    <div className="relative w-full" style={{ height: "280px" }}>
                      <motion.div 
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.max(barHeight * 2.8, 40)}px` }}
                        transition={{ delay: idx * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute bottom-0 left-0 right-0 group cursor-pointer transition-opacity duration-200 hover:opacity-90"
                        style={{ backgroundColor: barColor }}
                      >
                        {/* Rank badge for top 3 */}
                        {row.rank <= 3 && (
                          <div className="absolute -top-2 -right-2 w-5 h-5 bg-ink text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                            {row.rank}
                          </div>
                        )}
                      </motion.div>
                    </div>
                    
                    {/* Icon */}
                    <div className="w-8 h-8 flex items-center justify-center shrink-0">
                      <ModelIcon model={row.model} size={24} />
                    </div>
                    
                    {/* Model Name */}
                    <div className="h-10 flex items-start justify-center">
                      <span 
                        className="text-[10px] text-stone text-center leading-tight"
                        style={{ 
                          display: '-webkit-box', 
                          WebkitLineClamp: 2, 
                          WebkitBoxOrient: 'vertical', 
                          overflow: 'hidden',
                          maxWidth: "80px"
                        }}
                      >
                        {row.model}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : !loading && (
        <div className="panel p-10 text-stone text-center">
          {error ? `Error: ${error}` : "No benchmark data available for this category."}
        </div>
      )}

      {/* Enter Arena CTA */}
      <div className="text-center pt-6">
        <a href="/arena" className="btn-primary inline-flex items-center gap-2 text-sm">
          Enter Arena
          <ArrowUpRight className="w-4 h-4" strokeWidth={1.5} />
        </a>
      </div>
    </div>
  );
}