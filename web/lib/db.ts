import type Database from "better-sqlite3";

const DEFAULT_DB_PATH = "data/summaryarena.sqlite";

const schema = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL UNIQUE,
    model TEXT NOT NULL,
    provider TEXT NOT NULL,
    benchmark_version TEXT NOT NULL DEFAULT '1.0',
    config TEXT NOT NULL DEFAULT '{}',
    timestamp TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS test_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    test_id TEXT NOT NULL,
    category TEXT NOT NULL,
    source_text TEXT,
    summary TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    latency_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE,
    UNIQUE (run_id, test_id)
  );

  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id TEXT NOT NULL,
    model_a TEXT NOT NULL,
    model_b TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('a', 'b', 'tie', 'both_bad')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_test_results_run_id ON test_results(run_id);
  CREATE INDEX IF NOT EXISTS idx_test_results_test_id ON test_results(test_id);
  CREATE INDEX IF NOT EXISTS idx_votes_test_id ON votes(test_id);
  CREATE INDEX IF NOT EXISTS idx_votes_models ON votes(model_a, model_b);
`;

let databasePromise: Promise<InstanceType<typeof Database>> | null = null;

async function resolveDatabasePath(): Promise<string> {
  const [{ default: fs }, { default: path }] = await Promise.all([
    import("node:fs"),
    import("node:path"),
  ]);

  const configuredPath = process.env.SQLITE_PATH?.trim() || DEFAULT_DB_PATH;

  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }

  const cwdCandidate = path.resolve(process.cwd(), configuredPath);
  const workspaceWebCandidate = path.resolve(process.cwd(), "web", configuredPath);

  if (fs.existsSync(cwdCandidate)) {
    return cwdCandidate;
  }

  if (fs.existsSync(workspaceWebCandidate)) {
    return workspaceWebCandidate;
  }

  if (fs.existsSync(path.resolve(process.cwd(), "web"))) {
    return workspaceWebCandidate;
  }

  return cwdCandidate;
}

export async function getDatabase(): Promise<InstanceType<typeof Database>> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const [{ default: fs }, { default: path }, databaseModule] = await Promise.all([
        import("node:fs"),
        import("node:path"),
        import("better-sqlite3"),
      ]);
      const DatabaseConstructor = databaseModule.default;
      const databasePath = await resolveDatabasePath();
      fs.mkdirSync(path.dirname(databasePath), { recursive: true });
      const database = new DatabaseConstructor(databasePath);
      database.pragma("foreign_keys = ON");
      database.exec(schema);
      try {
        database.exec("ALTER TABLE test_results ADD COLUMN source_text TEXT");
      } catch {
        // Column already exists.
      }
      return database;
    })();
  }

  return databasePromise;
}
