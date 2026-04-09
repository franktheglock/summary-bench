// Mock data for initial UI development

export const MOCK_MODELS = [
  { rank: 1, name: "GPT-4o", modelId: "gpt-4o", provider: "openai", elo: 1250, winRate: 68, tests: 1540 },
  { rank: 2, name: "Claude 3.5 Sonnet", modelId: "claude-3-5-sonnet", provider: "anthropic", elo: 1245, winRate: 65, tests: 1200 },
  { rank: 3, name: "Llama 3.1 70B", modelId: "llama-3.1-70b", provider: "meta", elo: 1180, winRate: 58, tests: 400 },
  { rank: 4, name: "Gemini 1.5 Pro", modelId: "gemini-1.5-pro", provider: "google", elo: 1175, winRate: 56, tests: 850 },
  { rank: 5, name: "Llama 3.1 8B", modelId: "llama-3.1-8b", provider: "meta", elo: 1050, winRate: 45, tests: 200 },
  { rank: 6, name: "Mistral Large", modelId: "mistral-large", provider: "mistral", elo: 1030, winRate: 42, tests: 120 },
];

export const MOCK_TEST_CASES = [
  {
    test_id: "news-cnn-021",
    category: "news",
    source_text: "The rapid development of artificial intelligence has led to new regulatory challenges. Lawmakers in several jurisdictions are attempting to draft comprehensive AI frameworks aimed at preventing bias, ensuring data privacy, and managing systemic risks. However, the exact boundaries of these regulations remain contested. Some experts argue that overly rigid rules could stifle innovation, while others insist that without strict oversight, the potential for societal harm is too great. A recent proposal in the European Union would categorize AI systems by risk level, imposing the strictest requirements on 'high-risk' applications like biometric identification and critical infrastructure.",
    results: [
      {
        model: "llama-3.1-70b",
        summary: "Lawmakers are drafting new AI regulations to address bias, privacy, and systemic risks. The European Union has proposed categorizing AI systems by risk level, with 'high-risk' applications facing the strictest rules. Experts are divided on the approach, balancing the need for oversight against the risk of stifling innovation.",
      },
      {
        model: "gpt-4o",
        summary: "New regulatory challenges have emerged due to rapid AI development. Lawmakers are creating frameworks to prevent bias and ensure privacy. A notable EU proposal categorizes AI by risk, imposing heavy rules on high-risk uses. Opinions are split between fearing stifled innovation and emphasizing the necessity of strict oversight.",
      }
    ]
  }
];
