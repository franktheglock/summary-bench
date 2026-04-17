import { getModelStats } from "@/lib/arena-store";
import { getHuggingFaceModelCard, getHuggingFaceSearchName } from "@/lib/huggingface";
import { findOpenRouterModel } from "@/lib/openrouter";
import VerificationBadge from "@/app/_components/VerificationBadge";
import { ModelIcon } from "@lobehub/icons";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, ExternalLink, Cpu, BarChart3 } from "lucide-react";

async function getOpenRouterModelForPage(modelName: string, provider: string) {
  return (await findOpenRouterModel(modelName)) ?? await findOpenRouterModel(modelName, provider);
}

async function ModelDescription({
  openRouterPromise,
  huggingFacePromise,
}: {
  openRouterPromise: Promise<Awaited<ReturnType<typeof getOpenRouterModelForPage>>>;
  huggingFacePromise: Promise<Awaited<ReturnType<typeof getHuggingFaceModelCard>>>;
}) {
  const orModel = await openRouterPromise;
  const description = orModel?.description || (await huggingFacePromise)?.description;

  if (!description) {
    return null;
  }

  return (
    <div className="model-description-shell max-w-3xl">
      <p className="model-description-scroll text-stone leading-relaxed pr-3">
        {description}
      </p>
    </div>
  );
}

function ModelDescriptionFallback() {
  return (
    <div className="max-w-3xl space-y-2 pt-1">
      <div className="h-4 w-full rounded bg-paper-dark animate-pulse" />
      <div className="h-4 w-5/6 rounded bg-paper-dark animate-pulse" />
    </div>
  );
}

async function OpenRouterPanel({
  modelName,
  hfSearchName,
  openRouterPromise,
}: {
  modelName: string;
  hfSearchName: string;
  openRouterPromise: Promise<Awaited<ReturnType<typeof getOpenRouterModelForPage>>>;
}) {
  const orModel = await openRouterPromise;

  if (!orModel) {
    return (
      <div className="panel p-6 flex flex-col items-center justify-center text-center">
        <Cpu className="w-8 h-8 text-border mb-3" />
        <h3 className="font-semibold text-ink mb-1">Not on OpenRouter</h3>
        <p className="text-xs text-stone mb-6">This model may be private, local, or uses a non-standard API alias.</p>
        <a
          href={`https://huggingface.co/models?search=${encodeURIComponent(hfSearchName)}`}
          target="_blank"
          rel="noreferrer"
          className="w-full flex items-center justify-center gap-2 border border-border text-stone py-2.5 px-4 rounded text-sm font-semibold hover:bg-paper-dark transition-colors"
        >
          Search on Hugging Face <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    );
  }

  return (
    <div className="panel p-6 bg-gradient-to-br from-[#fdfbf7] to-[#f7f6f3] border-terracotta/30">
      <h3 className="font-semibold text-ink mb-4 flex items-center gap-2">
        <Cpu className="w-4 h-4 text-terracotta" /> OpenRouter Data
      </h3>
      <div className="space-y-4 mb-6">
        <div className="flex justify-between items-center text-sm">
          <span className="text-stone">Context</span>
          <span className="font-mono font-medium text-ink">{orModel.context_length.toLocaleString()} <span className="opacity-50">tokens</span></span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-stone">Prompt Cost</span>
          <span className="font-mono font-medium text-ink">${(parseFloat(orModel.pricing.prompt) * 1000000).toPrecision(3)} <span className="opacity-50">/ 1M</span></span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-stone">Completion Cost</span>
          <span className="font-mono font-medium text-ink">${(parseFloat(orModel.pricing.completion) * 1000000).toPrecision(3)} <span className="opacity-50">/ 1M</span></span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <a
          href={`https://openrouter.ai/models/${orModel.id}`}
          target="_blank"
          rel="noreferrer"
          className="w-full flex items-center justify-center gap-2 bg-ink text-white py-2.5 px-4 rounded text-sm font-semibold hover:bg-stone-800 transition-colors"
        >
          View on OpenRouter <ExternalLink className="w-4 h-4" />
        </a>
        <a
          href={`https://huggingface.co/models?search=${encodeURIComponent(hfSearchName)}`}
          target="_blank"
          rel="noreferrer"
          className="w-full flex items-center justify-center gap-2 border border-border text-stone py-2.5 px-4 rounded text-sm font-semibold hover:bg-paper-dark transition-colors"
        >
          Search on Hugging Face <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

function OpenRouterPanelFallback({ modelName }: { modelName: string }) {
  return (
    <div className="panel p-6 bg-gradient-to-br from-[#fdfbf7] to-[#f7f6f3] border-terracotta/20">
      <div className="flex items-center gap-2 mb-4">
        <Cpu className="w-4 h-4 text-terracotta" />
        <h3 className="font-semibold text-ink">Loading model metadata</h3>
      </div>
      <p className="text-sm text-stone mb-5">Fetching OpenRouter details for {modelName}.</p>
      <div className="space-y-3 mb-6">
        <div className="h-4 rounded bg-paper-dark animate-pulse" />
        <div className="h-4 rounded bg-paper-dark animate-pulse" />
        <div className="h-4 rounded bg-paper-dark animate-pulse" />
      </div>
      <div className="space-y-2">
        <div className="h-10 rounded bg-paper-dark animate-pulse" />
        <div className="h-10 rounded bg-paper-dark animate-pulse" />
      </div>
    </div>
  );
}

export default async function ModelDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let modelName = decodeURIComponent(slug);
  // Ensure it's fully decoded (e.g. if %2F was double-encoded to %252F)
  try {
    while (modelName !== decodeURIComponent(modelName)) {
      modelName = decodeURIComponent(modelName);
    }
  } catch (e) {
    // Ignore malformed URIs
  }
  // Also explicitly replace any remaining %2f or %2F just to be absolutely certain
  modelName = modelName.replace(/%2f/gi, '/');
  
  const hfSearchName = getHuggingFaceSearchName(modelName);
  const stats = await getModelStats(modelName);

  if (!stats || stats.length === 0) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-3xl font-serif font-semibold text-ink mb-4">Model Not Found</h1>
        <p className="text-stone mb-8">We couldn't find any data for "{modelName}".</p>
        <Link href="/leaderboard" className="btn bg-ink text-white px-4 py-2 rounded inline-flex items-center gap-2 font-semibold">
          <ArrowLeft className="w-4 h-4" /> Back to Leaderboard
        </Link>
      </div>
    );
  }

  const provider = stats[0].provider;
  const openRouterPromise = getOpenRouterModelForPage(modelName, provider);
  const huggingFacePromise = getHuggingFaceModelCard(modelName, provider);

  // Stats for "All"
  const globalStat = stats.find((s) => s.category === "all") || stats[0];

  return (
    <div className="space-y-12 pb-20">
      <Link href="/leaderboard" className="inline-flex items-center gap-2 text-stone hover:text-terracotta transition-colors text-sm font-semibold uppercase tracking-wider">
        <ArrowLeft className="w-4 h-4" /> Back to Leaderboard
      </Link>

      {/* Header Profile */}
      <div className="flex flex-col md:flex-row gap-8 items-start">
        <div className="w-24 h-24 md:w-32 md:h-32 bg-paper-dark rounded-2xl flex items-center justify-center shrink-0 border border-border shadow-sm">
          <ModelIcon model={modelName} size={64} />
        </div>
        <div className="flex-1">
          <div className="inline-block px-2 py-1 bg-stone-100 text-stone-500 text-[10px] font-bold uppercase tracking-widest rounded mb-3">
            {provider}
          </div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <h1 className="font-serif text-4xl md:text-5xl font-semibold tracking-tight text-ink">
              {modelName}
            </h1>
            {globalStat.verified ? <VerificationBadge className="w-5 h-5" /> : null}
          </div>
          <Suspense fallback={<ModelDescriptionFallback />}>
            <ModelDescription
              openRouterPromise={openRouterPromise}
              huggingFacePromise={huggingFacePromise}
            />
          </Suspense>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Quick Stats */}
        <div className="panel p-6 col-span-1 md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="space-y-1">
              <span className="label block text-stone-light">Global Rank</span>
              <div className="font-mono text-3xl font-semibold text-ink">#{globalStat.rank}</div>
              <div className="text-xs text-stone">out of {globalStat.totalModels}</div>
            </div>
            <div className="space-y-1">
              <span className="label block text-stone-light">ELO Score</span>
              <div className="font-mono text-3xl font-semibold text-ink">{(globalStat.elo ?? 0).toLocaleString()}</div>
              <div className="text-xs text-stone">{globalStat.votes < 20 ? "Provisional" : "Confident"}</div>
            </div>
            <div className="space-y-1">
              <span className="label block text-stone-light">Win Rate</span>
              <div className="font-mono text-3xl font-semibold text-ink">{globalStat.win_rate}%</div>
              <div className="text-xs text-stone">Avg. performance</div>
            </div>
            <div className="space-y-1">
              <span className="label block text-stone-light">Total Tests</span>
              <div className="font-mono text-3xl font-semibold text-ink">{globalStat.tests.toLocaleString()}</div>
              <div className="text-xs text-stone">{globalStat.votes} matchups</div>
            </div>
        </div>
        <Suspense fallback={<OpenRouterPanelFallback modelName={modelName} />}>
          <OpenRouterPanel
            modelName={modelName}
            hfSearchName={hfSearchName}
            openRouterPromise={openRouterPromise}
          />
        </Suspense>
      </div>

      {/* Category Breakdown */}
      <div>
        <h2 className="font-serif text-2xl font-semibold tracking-tight text-ink mb-6 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-terracotta" /> Category Breakdown
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.filter(s => s.category !== 'all').map((stat) => (
            <div key={stat.category} className="panel p-5 hover:border-terracotta transition-colors group">
              <div className="flex justify-between items-start mb-4">
                 <div>
                   <h3 className="font-semibold text-ink text-lg capitalize">{stat.category}</h3>
                   <span className="text-xs text-stone-light">Rank #{stat.rank} of {stat.totalModels}</span>
                 </div>
                 <div className="bg-paper-dark px-2 py-1 rounded">
                   <div className="text-xs label text-stone-light mb-0.5">ELO</div>
                   <div className="font-mono font-semibold text-ink text-sm">{(stat.elo ?? 0).toLocaleString()}</div>
                 </div>
              </div>

              <div className="space-y-3">
                 <div>
                   <div className="flex justify-between text-xs mb-1">
                     <span className="text-stone">Win Rate</span>
                     <span className="font-mono font-medium text-ink">{stat.win_rate}%</span>
                   </div>
                   <div className="h-1.5 bg-paper overflow-hidden rounded-full">
                     <div className="h-full bg-terracotta group-hover:bg-ink transition-colors" style={{ width: `${stat.win_rate}%` }} />
                   </div>
                 </div>
                 <div className="flex justify-between items-center pt-2 border-t border-border">
                    <span className="text-xs text-stone">Matchups</span>
                    <span className="font-mono text-sm text-ink">{stat.votes}</span>
                 </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    
    </div>
  );
}
