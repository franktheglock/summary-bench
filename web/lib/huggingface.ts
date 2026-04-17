export interface HuggingFaceModelCard {
  id: string;
  description: string | null;
}

export function getHuggingFaceSearchName(modelName: string) {
  const cleanModel = modelName.trim();
  const decodedModel = decodeURIComponent(cleanModel);
  const normalizedModel = decodedModel.replace(/%2f/gi, "/");
  const baseModel = normalizedModel.replace(/^.*\//, "") || normalizedModel;

  return baseModel.replace(/@.+$/, "").trim();
}

async function fetchText(url: string) {
  const response = await fetch(url, { next: { revalidate: 3600 } });
  if (!response.ok) {
    return null;
  }

  return response.text();
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripFrontMatter(markdown: string) {
  return markdown.replace(/^---\s*[\r\n]+[\s\S]*?[\r\n]+---\s*/u, "");
}

function stripMarkdownAdmonitions(markdown: string) {
  return markdown.replace(/(?:^|\n)\s*>\s*\[!(?:NOTE|WARNING|INFO|TIP|IMPORTANT)\][\s\S]*?(?=\n\s*\n|$)/gi, "\n");
}

function normalizeReadmeBlock(block: string) {
  return block
    .replace(/^\s*(?:model\s+summary|overview|description)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyAnnouncementBlock(block: string) {
  return /^(?:[\p{Extended_Pictographic}\p{Emoji_Presentation}]\s*)?(?:update|announcement|news|release note)\b/iu.test(block);
}

function isUsefulDescriptionBlock(block: string) {
  if (block.length < 100) {
    return false;
  }

  if (isLikelyAnnouncementBlock(block)) {
    return false;
  }

  if (!/[.?!]/.test(block)) {
    return false;
  }

  return true;
}

function extractDescriptionFromReadme(markdown: string) {
  const cleaned = stripMarkdownAdmonitions(stripFrontMatter(markdown).replace(/\r\n/g, "\n").replace(/\r/g, "\n"))
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  const blocks = cleaned
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  for (const block of blocks) {
    if (block.startsWith("#")) continue;
    if (block.startsWith("|") || block.includes("---|")) continue;
    if (block.startsWith("<")) continue;

    const singleLine = normalizeReadmeBlock(block);
    if (!isUsefulDescriptionBlock(singleLine)) continue;

    return singleLine;
  }

  return null;
}

function extractDescriptionFromHtml(html: string) {
  const sectionMatch = html.match(/Description<\/h3>[\s\S]*?<p>([\s\S]*?)<\/p>/i);
  if (sectionMatch?.[1]) {
    const text = decodeHtmlEntities(sectionMatch[1].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();

    if (text.length >= 60) {
      return text;
    }
  }

  const metaMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content=["']([\s\S]*?)["']/i);
  if (metaMatch?.[1]) {
    const text = decodeHtmlEntities(metaMatch[1]).replace(/\s+/g, " ").trim();
    if (text.length >= 60) {
      return text;
    }
  }

  return null;
}

async function findFirstExistingModelId(candidates: string[]) {
  for (const candidate of candidates) {
    if (!candidate) continue;

    const response = await fetch(`https://huggingface.co/api/models/${encodeURIComponent(candidate)}`, {
      next: { revalidate: 3600 },
    }).catch(() => null);

    if (response?.ok) {
      return candidate;
    }
  }

  return null;
}

export async function getHuggingFaceModelCard(modelName: string, providerName?: string) {
  const cleanModel = modelName.trim();
  const provider = (providerName || "").trim().toLowerCase();
  const hfSearchName = getHuggingFaceSearchName(cleanModel);

  const candidateIds = [
    cleanModel,
    provider ? `${provider}/${hfSearchName}` : "",
    cleanModel.replace(/_/g, "/"),
    provider ? `${provider}/${cleanModel.replace(/_/g, "/")}` : "",
  ].filter((candidate, index, all) => Boolean(candidate) && all.indexOf(candidate) === index);

  let modelId = await findFirstExistingModelId(candidateIds);

  if (!modelId) {
    const searchResponse = await fetch(
      `https://huggingface.co/api/models?search=${encodeURIComponent(hfSearchName)}&limit=1`,
      { next: { revalidate: 3600 } },
    ).catch(() => null);

    if (searchResponse?.ok) {
      const results = await searchResponse.json().catch(() => [] as Array<{ id?: string }>);
      modelId = Array.isArray(results) ? (results[0]?.id ?? null) : null;
    }
  }

  if (!modelId) {
    return null;
  }

  const readme = await fetchText(`https://huggingface.co/${modelId}/raw/main/README.md`);
  const readmeDescription = readme ? extractDescriptionFromReadme(readme) : null;
  if (readmeDescription) {
    return {
      id: modelId,
      description: readmeDescription,
    } satisfies HuggingFaceModelCard;
  }

  const pageHtml = await fetchText(`https://huggingface.co/${modelId}`);

  return {
    id: modelId,
    description: pageHtml ? extractDescriptionFromHtml(pageHtml) : null,
  } satisfies HuggingFaceModelCard;
}