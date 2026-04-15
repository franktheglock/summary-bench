export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  pricing: {
    prompt: string;
    completion: string;
    image?: string;
    request?: string;
  };
  context_length: number;
  architecture: {
    modality: string;
    tokenizer: string;
    instruct_type: string | null;
  };
}

let openRouterCache: OpenRouterModel[] | null = null;
let cacheExpiresAt = 0;

export async function getOpenRouterModels(): Promise<OpenRouterModel[]> {
  if (openRouterCache && Date.now() < cacheExpiresAt) {
    return openRouterCache;
  }
  
  try {
    // Revalidation happens natively in Next.js via fetch options, but we also keep an in-memory cache
    // just in case we call this 50 times in a single server pass.
    const response = await fetch("https://openrouter.ai/api/v1/models", { next: { revalidate: 3600 } });
    if (!response.ok) return [];
    
    const data = await response.json();
    openRouterCache = data.data as OpenRouterModel[];
    cacheExpiresAt = Date.now() + 3600 * 1000;
    return openRouterCache;
  } catch {
    return [];
  }
}

export async function findOpenRouterModel(modelName: string, providerName?: string): Promise<OpenRouterModel | null> {
  const models = await getOpenRouterModels();
  if (!models || models.length === 0) return null;
  
  let cleanModel = modelName.toLowerCase().trim();
  const cleanProvider = (providerName || "").toLowerCase().trim();

  // Handle specific model name discrepancies
  if (cleanModel === "lfm2-24b-a2b") cleanModel = "lfm-2-24b-a2b";

  // Try exact combo if provider is known
  if (cleanProvider) {
    const exactKey = `${cleanProvider}/${cleanModel}`;
    const exactMatch = models.find(m => m.id.toLowerCase() === exactKey);
    if (exactMatch) return exactMatch;
  }

  // Common aliases if direct match fails
  const tryIds = [
    `${cleanProvider}/${cleanModel}`,
    `meta-llama/${cleanModel}`,
    `openai/${cleanModel}`,
    `anthropic/${cleanModel}`,
    `google/${cleanModel}`,
    `cohere/${cleanModel}`,
    `mistralai/${cleanModel}`,
    `deepseek/${cleanModel}`,
    `x-ai/${cleanModel}`,
    cleanModel, 
    cleanModel.replace(/_/g, "/"),
  ];

  for (const id of tryIds) {
    if (!id || id === "/") continue;
    const match = models.find(m => m.id.toLowerCase() === id.toLowerCase());
    if (match) return match;
  }

  // Fallback: Model might be formatted like <provider>_<model>
  if (cleanModel.includes("_")) {
    const underscoreConverted = cleanModel.replace("_", "/");
    const convertedMatch = models.find(m => m.id.toLowerCase() === underscoreConverted);
    if (convertedMatch) return convertedMatch;
  }

  // Fallback: search for suffix matching
  const suffixMatch = models.find(m => 
    m.id.toLowerCase().endsWith(`/${cleanModel}`) || 
    m.id.toLowerCase().endsWith(`-${cleanModel}`)
  );
  if (suffixMatch) return suffixMatch;

  // Final fallback: fuzzy includes
  const fuzzy = models.find(m => m.id.toLowerCase().includes(cleanModel));
  if (fuzzy) return fuzzy;

  return null;
}
