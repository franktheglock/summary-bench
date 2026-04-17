import { getModelStats } from "@/lib/arena-store";
import { findOpenRouterModel } from "@/lib/openrouter";
import { ModelIcon } from "@lobehub/icons";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Cpu, BarChart3 } from "lucide-react";

export default async function ModelDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const modelName = decodeURIComponent(slug);
  // Extract the part after "/" for Hugging Face search, or use full name if no "/"
  const hfSearchName = modelName.includes("/") ? modelName.split("/")[1] : modelName;
  const openRouterPromise = findOpenRouterModel(modelName);
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
  const orModel = (await openRouterPromise) ?? await findOpenRouterModel(modelName, provider);

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
          <h1 className="font-serif text-4xl md:text-5xl font-semibold tracking-tight text-ink mb-4">
            {modelName}
          </h1>
          {orModel && (
            <p className="text-stone leading-relaxed max-w-3xl">
              {orModel.description}
            </p>
          )}
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

        {/* OpenRouter Integration */}
        {orModel ? (
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
        ) : (
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
        )}
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
