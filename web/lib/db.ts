import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

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

let database: InstanceType<typeof Database> | null = null;

function resolveDatabasePath(): string {
  const configuredPath = process.env.SQLITE_PATH?.trim() || DEFAULT_DB_PATH;
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);
}

export function getDatabase(): InstanceType<typeof Database> {
  if (!database) {
    const databasePath = resolveDatabasePath();
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    database = new Database(databasePath);
    database.pragma("foreign_keys = ON");
    database.exec(schema);
  }

  return database;
}
