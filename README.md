# 🏟️ Summary Arena

**Like [LMSYS Chatbot Arena](https://chat.lmsys.org/) — but 100% focused on summarization quality.**

Benchmark any LLM's summarization ability locally, then upload results to the public leaderboard for community voting.

---

## How It Works

```
┌─────────────────────────────────────────────────────┐
│  YOUR MACHINE                                       │
│                                                     │
│  summaryarena run                                   │
│    ├── loads test cases (news, code, legal, ...)    │
│    ├── sends prompts to YOUR provider               │
│    │   (Ollama / LM Studio / OpenRouter / vLLM)     │
│    ├── measures latency, token counts               │
│    └── writes results-v1.json                       │
│                                                     │
│  No data leaves your machine during benchmarking.   │
└─────────────────┬───────────────────────────────────┘
                  │ upload (optional)
                  ▼
┌─────────────────────────────────────────────────────┐
│  SUMMARY ARENA WEBSITE                              │
│                                                     │
│  /submit    → upload results JSON                   │
│  /arena     → blind vote on summaries               │
│  /leaderboard → per-category rankings               │
│                                                     │
│  Human votes are the primary ranking signal.        │
│  Auto-metrics (ROUGE-L, BERTScore) are tiebreakers. │
└─────────────────────────────────────────────────────┘
```

## Core Principles

- **Inference never touches the server** — all model calls stay on your machine/provider
- **No full input texts uploaded** — only test_id references + generated summaries
- **Human votes are primary** — auto-metrics are tiebreakers only
- **Fully extensible** — new categories and test cases via GitHub PRs
- **MIT Licensed** — self-hostable, zero proprietary dependencies

## Quick Start (CLI)

### Install

```bash
cd script
pip install -e .
```

### Configure

```bash
summaryarena init
```

This creates `~/.summaryarena/config.yaml`. Edit it with your provider details:

```yaml
provider: ollama
model: llama3.1
base_url: http://localhost:11434
temperature: 0.0
```

### Run a Benchmark

```bash
# All categories
summaryarena run --provider ollama --model llama3.1

# Specific categories only
summaryarena run --provider openrouter --model meta-llama/llama-3.1-70b-instruct --categories news,code

# Multiple runs for consistency
summaryarena run --provider groq --model llama-3.3-70b-versatile --runs 3
```
 
### Quick Windows test (run.bat)

If you're on Windows and want an easy interactive test, run the bundled `run.bat` from the repository root. It will check for Python and required packages, install locally if needed, verify test data, and launch the interactive benchmark TUI.

Open a Command Prompt in the project folder and run:

```cmd
run.bat
```

Or double-click `run.bat` in File Explorer.

Note: `run.bat` requires Python on `PATH` and the `datasets/v1/test_cases.json` file to be present.

(it will fail just keep running it till it works)

### Validate Results

```bash
summaryarena validate results.json
```

## Supported Providers

| Provider | Prefix | Example Model |
|---|---|---|
| Ollama | `ollama` | `llama3.1` |
| LM Studio | `lm_studio` | `my-model` |
| OpenRouter | `openrouter` | `meta-llama/llama-3.1-70b-instruct` |
| vLLM | `vllm` | `my-deployed-model` |
| Groq | `groq` | `llama-3.3-70b-versatile` |
| Together AI | `together_ai` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |
| NVIDIA NIM | `nvidia_nim` | `meta/llama3-70b-instruct` |
| OpenAI | `openai` | `gpt-4o` |

## Test Categories

| Category | Cases | Source | Description |
|---|---|---|---|
| `news` | 20 | CNN/DailyMail | News article summarization (512–2048 tokens) |
| `code` | 15 | Curated snippets | Code summarization (Python/JS) |
| `agentic` | 15 | Synthetic | Multi-turn agent interaction traces |
| `meeting` | 10 | QMSum | Meeting transcript summarization |
| `legal` | 10 | CUAD | Contract clause summarization |
| `scientific` | 10 | arXiv papers | Scientific paper summarization |
| `reviews` | 10 | Amazon Reviews | Product review aggregation |

## Project Structure

```
summaryarena/
├── script/              # Python CLI package
│   ├── summaryarena/    # Core library
│   ├── tests/           # pytest tests
│   └── pyproject.toml
├── web/                 # Next.js 15 website (Phase 2)
├── datasets/
│   ├── v1/              # Versioned test cases
│   │   ├── test_cases.json
│   │   └── prompt_templates.yaml
│   └── scripts/         # Dataset curation tools
├── docs/
│   └── CONTRIBUTING.md
├── LICENSE              # MIT
└── README.md
```

## Contributing

See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for how to add new test cases, categories, or improve the tool.

## License

MIT — see [LICENSE](LICENSE).
