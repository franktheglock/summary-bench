"use client";

import { startTransition, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, ShieldOff } from "lucide-react";

type ModerationModel = {
  model: string;
  provider: string;
  tests: number;
  votes: number;
  win_rate: number;
  avg_latency_ms: number;
  latest_run: string;
  elo?: number;
  verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
};

export default function ModeratorDashboardClient({
  initialModels,
  moderatorLabel,
}: {
  initialModels: ModerationModel[];
  moderatorLabel: string;
}) {
  const [models, setModels] = useState(initialModels);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleVerification(model: string, provider: string, verified: boolean) {
    const key = `${model}::${provider}`;
    setBusyKey(key);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/moderation/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, provider, verified }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || "Verification update failed.");
      }

      startTransition(() => {
        setModels((current) => current.map((row) => {
          if (row.model !== model || row.provider !== provider) {
            return row;
          }

          return {
            ...row,
            verified,
            verified_at: verified ? result.verification?.verified_at ?? new Date().toISOString() : null,
            verified_by: verified ? result.verification?.verified_by ?? moderatorLabel : null,
          };
        }));
      });

      setMessage(verified ? `Verified ${model}.` : `Removed verification for ${model}.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Verification update failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function verifyAllModels() {
    setBusyKey("all");
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/moderation/verify-all", {
        method: "POST",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error || "Bulk verification failed.");
      }

      startTransition(() => {
        setModels((current) => current.map((row) => ({
          ...row,
          verified: true,
          verified_at: result.verified_at ?? new Date().toISOString(),
          verified_by: result.verified_by ?? moderatorLabel,
        })));
      });

      setMessage(`Marked ${result.count ?? models.length} models as verified.`);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Bulk verification failed.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="panel-elevated p-6 md:p-8 bg-[radial-gradient(circle_at_top_left,_rgba(196,112,75,0.16),_transparent_42%),linear-gradient(180deg,_#fffdf9,_#f6f0e8)] border-terracotta/30">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <p className="label">Moderator Control</p>
            <div className="space-y-2">
              <h1 className="font-serif text-4xl md:text-5xl font-semibold tracking-tight text-ink">
                Verification Desk
              </h1>
              <p className="max-w-2xl text-stone leading-relaxed">
                Review uploaded models, mark trusted entries, and bulk-verify the current catalog when you have independently confirmed the identities.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <button
              onClick={verifyAllModels}
              className="btn-primary inline-flex items-center gap-2"
              disabled={busyKey === "all"}
            >
              {busyKey === "all" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Verify All Models
            </button>
            <form action="/auth/signout" method="post">
              <button className="btn-secondary" type="submit">Sign out</button>
            </form>
          </div>
        </div>
      </div>

      {message ? <div className="panel border-olive-light bg-sage-light p-4 text-sm text-ink-light">{message}</div> : null}
      {error ? <div className="panel border-terracotta-light bg-terracotta-light p-4 text-sm text-ink-light">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {models.map((row) => {
          const key = `${row.model}::${row.provider}`;
          const pending = busyKey === key;

          return (
            <div key={key} className="panel p-5 flex flex-col gap-4 hover:border-terracotta transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <h2 className="font-semibold text-ink truncate">{row.model}</h2>
                    {row.verified ? (
                      <span title="This model has been verified to be the model it says it is." className="text-olive shrink-0">
                        <ShieldCheck className="w-4 h-4" strokeWidth={2} />
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs uppercase tracking-widest text-stone-light">{row.provider}</p>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] rounded border ${row.verified ? "bg-sage-light text-olive border-olive-light" : "bg-paper-dark text-stone border-border"}`}>
                  {row.verified ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
                  {row.verified ? "Verified" : "Pending"}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="label block mb-1">ELO</span>
                  <span className="font-mono text-ink">{(row.elo ?? 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="label block mb-1">Votes</span>
                  <span className="font-mono text-ink">{row.votes.toLocaleString()}</span>
                </div>
                <div>
                  <span className="label block mb-1">Tests</span>
                  <span className="font-mono text-ink">{row.tests.toLocaleString()}</span>
                </div>
              </div>

              <div className="text-xs text-stone space-y-1 min-h-10">
                <p>Latest run: <span className="font-mono text-ink">{new Date(row.latest_run).toLocaleString()}</span></p>
                {row.verified_at ? (
                  <p>
                    Verified {new Date(row.verified_at).toLocaleString()}
                    {row.verified_by ? ` by ${row.verified_by}` : ""}
                  </p>
                ) : (
                  <p>No moderator verification recorded yet.</p>
                )}
              </div>

              <button
                onClick={() => toggleVerification(row.model, row.provider, !row.verified)}
                className={row.verified ? "btn-secondary justify-center" : "btn-primary justify-center"}
                disabled={pending}
              >
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {row.verified ? "Remove Verification" : "Verify Model"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
