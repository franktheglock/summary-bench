"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, Filter, Loader2, Minus, RefreshCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { ModelIcon } from "@lobehub/icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type VoteChoice = "a" | "b" | "tie" | "both_bad";

type ArenaCandidate = {
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

// Category display names mapping
const CATEGORY_LABELS: Record<string, string> = {
  all: "All Categories",
  news: "News",
  code: "Code",
  legal: "Legal",
  scientific: "Scientific",
  agentic: "Agentic",
  meeting: "Meeting",
  reviews: "Reviews",
};

// Markdown styles wrapper
const MarkdownContent = ({ children }: { children: string }) => (
  <div className="prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="text-ink-light leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-4 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1">{children}</ol>,
        li: ({ children }) => <li className="text-ink-light">{children}</li>,
        code: ({ children }) => (
          <code className="bg-paper-dark px-1.5 py-0.5 rounded text-xs font-mono text-ink">{children}</code>
        ),
        pre: ({ children }) => (
          <pre className="bg-paper-dark p-3 rounded overflow-x-auto text-xs">{children}</pre>
        ),
        strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
        em: ({ children }) => <em className="italic text-ink-light">{children}</em>,
        h1: ({ children }) => <h1 className="text-lg font-semibold text-ink mt-4 mb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-semibold text-ink mt-3 mb-2">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-ink mt-2 mb-1">{children}</h3>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-terracotta pl-3 italic text-stone my-2">{children}</blockquote>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  </div>
);

export default function ArenaPage() {
  const [candidate, setCandidate] = useState<ArenaCandidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingVote, setSavingVote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [votedFor, setVotedFor] = useState<VoteChoice | null>(null);
  const [revealedModelA, setRevealedModelA] = useState(false);
  const [revealedModelB, setRevealedModelB] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showFilter, setShowFilter] = useState(false);

  const loadCandidate = async () => {
    setLoading(true);
    setError(null);
    setHasVoted(false);
    setVotedFor(null);
    setRevealedModelA(false);
    setRevealedModelB(false);

    try {
      const url = `/api/arena?category=${encodeURIComponent(selectedCategory)}`;
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "No comparable uploaded summaries are available yet.");
      }

      setCandidate(data.candidate);
    } catch (loadError) {
      setCandidate(null);
      setError(loadError instanceof Error ? loadError.message : "Failed to load the next vote.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCandidate();
  }, [selectedCategory]);

  const handleVote = async (vote: VoteChoice) => {
    if (!candidate || savingVote) {
      return;
    }

    setSavingVote(true);
    setHasVoted(true);
    setVotedFor(vote);
    setRevealedModelA(true);
    setRevealedModelB(true);

    try {
      const response = await fetch("/api/arena", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ vote, candidate }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.details || result?.error || "Failed to save vote.");
      }
    } catch (voteError) {
      setError(voteError instanceof Error ? voteError.message : "Failed to save vote.");
    } finally {
      setSavingVote(false);
    }
  };

  const handleNext = async () => {
    await loadCandidate();
  };

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    setShowFilter(false);
  };

  const currentTest = candidate;

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex justify-between items-end">
        <div>
          <p className="label mb-3">Blind Evaluation</p>
          <h1 className="font-serif text-5xl font-semibold tracking-tight text-ink">Arena</h1>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 justify-end mb-2">
            <span className="badge bg-terracotta-light text-terracotta-dark px-2.5 py-1">
              {currentTest?.category ?? "Loading"}
            </span>
            <button
              onClick={() => setShowFilter(!showFilter)}
              className="p-1.5 hover:bg-paper-dark rounded transition-colors"
              title="Filter by category"
            >
              <Filter className="w-4 h-4 text-stone" />
            </button>
          </div>
          <p className="text-xs text-stone-light mt-1 font-mono">
            {currentTest?.test_id ?? "Fetching uploaded data..."}
          </p>
        </div>
      </div>

      {/* Category Filter Dropdown */}
      {showFilter && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="panel p-4"
        >
          <p className="label mb-3">Filter by category</p>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => handleCategoryChange(key)}
                disabled={loading}
                className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all border
                  ${selectedCategory === key
                    ? "bg-ink text-paper border-ink"
                    : "bg-transparent text-stone border-border hover:border-ink hover:text-ink"}
                `}
              >
                {label}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {error && (
        <div className="panel border-terracotta-light bg-terracotta-light p-4 text-sm text-ink-light">
          {error}
        </div>
      )}

      {loading && (
        <div className="panel p-10 flex items-center justify-center gap-3 text-stone">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading uploaded summaries...
        </div>
      )}

      {!loading && !currentTest && !error && (
        <div className="panel p-10 text-stone-light">
          No comparable uploaded summaries are available yet{selectedCategory !== "all" ? ` for ${CATEGORY_LABELS[selectedCategory]}` : ""}. 
          Upload at least two model runs with overlapping test cases and non-empty summaries.
        </div>
      )}

      <AnimatePresence mode="wait">
        {currentTest && (
          <motion.div
            key={currentTest.test_id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-6"
          >
            <div className="panel p-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-terracotta" strokeWidth={1.5} />
                <span className="label">Original text</span>
              </div>
              <div className="text-ink-light leading-relaxed text-[15px]">
                {currentTest.source_text ||
                  "The original source text was not found in the local dataset cache for this test case."}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
              <div className="md:absolute md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:z-10 hidden md:flex items-center justify-center w-12 h-12 bg-terracotta text-white">
                <span className="font-serif font-bold text-sm">vs</span>
              </div>

              <div
                className={`panel p-6 flex flex-col transition-all duration-200 ${
                  votedFor === "a" ? "ring-2 ring-terracotta" : ""
                } ${votedFor === "b" ? "opacity-40" : ""}`}
              >
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    {!revealedModelA && <div className="w-6 h-6 rounded-full bg-paper-dark" />}
                    {revealedModelA && <ModelIcon model={currentTest.model_a ?? ""} size={20} />}
                    <h2 className="font-serif text-xl font-semibold text-ink">
                      {revealedModelA ? currentTest.model_a : "Model A"}
                    </h2>
                  </div>
                </div>
                <div className="flex-1 text-ink-light text-[15px] min-h-[160px]">
                  <MarkdownContent>{currentTest.summary_a}</MarkdownContent>
                </div>
                <p className="mt-4 text-xs uppercase tracking-wider text-stone-light">
                  {currentTest.provider_a}
                </p>
                {!hasVoted && (
                  <div className="mt-6 pt-4 border-t border-border">
                    <button
                      onClick={() => handleVote("a")}
                      className="btn-primary w-full justify-center"
                      disabled={savingVote}
                    >
                      <ThumbsUp className="w-4 h-4 mr-2" strokeWidth={1.5} /> Vote A
                    </button>
                  </div>
                )}
              </div>

              <div
                className={`panel p-6 flex flex-col transition-all duration-200 ${
                  votedFor === "b" ? "ring-2 ring-terracotta" : ""
                } ${votedFor === "a" ? "opacity-40" : ""}`}
              >
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    {!revealedModelB && <div className="w-6 h-6 rounded-full bg-paper-dark" />}
                    {revealedModelB && <ModelIcon model={currentTest.model_b ?? ""} size={20} />}
                    <h2 className="font-serif text-xl font-semibold text-ink">
                      {revealedModelB ? currentTest.model_b : "Model B"}
                    </h2>
                  </div>
                </div>
                <div className="flex-1 text-ink-light text-[15px] min-h-[160px]">
                  <MarkdownContent>{currentTest.summary_b}</MarkdownContent>
                </div>
                <p className="mt-4 text-xs uppercase tracking-wider text-stone-light">
                  {currentTest.provider_b}
                </p>
                {!hasVoted && (
                  <div className="mt-6 pt-4 border-t border-border">
                    <button
                      onClick={() => handleVote("b")}
                      className="btn-secondary w-full justify-center"
                      disabled={savingVote}
                    >
                      <ThumbsUp className="w-4 h-4 mr-2" strokeWidth={1.5} /> Vote B
                    </button>
                  </div>
                )}
              </div>
            </div>

            {!hasVoted && (
              <div className="flex justify-center gap-4 pt-4">
                <button onClick={() => handleVote("tie")} className="btn-secondary" disabled={savingVote}>
                  <Minus className="w-4 h-4 mr-2" strokeWidth={1.5} /> Tie
                </button>
                <button
                  onClick={() => handleVote("both_bad")}
                  className="btn-secondary hover:border-rose-light"
                  disabled={savingVote}
                  style={{ ["--tw-border-opacity" as string]: undefined }}
                >
                  <ThumbsDown className="w-4 h-4 mr-2" strokeWidth={1.5} /> Both Bad
                </button>
                <button
                  onClick={() => handleVote("both_bad")}
                  className="px-6 py-2.5 text-stone-light hover:text-ink transition-colors text-xs flex items-center gap-2 uppercase tracking-wider font-medium"
                  disabled={savingVote}
                >
                  <RefreshCcw className="w-4 h-4" strokeWidth={1.5} /> Skip
                </button>
              </div>
            )}

            {hasVoted && (
              <div className="panel p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="label mb-1">Vote saved</p>
                  <p className="text-sm text-ink-light">
                    Model names are now revealed. Click next when you are ready for another pair.
                  </p>
                </div>
                <button onClick={handleNext} className="btn-primary inline-flex items-center gap-2" disabled={savingVote}>
                  Next comparison
                  <RefreshCcw className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}