"use client";

import { useEffect, useState } from "react";
import { UploadCloud, FileJson, CheckCircle, AlertTriangle, LogIn, Loader2 } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { benchmarkUploadSchema, type BenchmarkUpload } from "@/lib/upload-schema";
import { createSupabaseBrowserClient, hasSupabaseAuthConfig } from "@/lib/supabase/browser";

export default function UploadPage() {
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = loading
  const [authLoading, setAuthLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "validating" | "uploading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [uploadedRunId, setUploadedRunId] = useState<string | null>(null);
  const [uploadedCount, setUploadedCount] = useState<number>(0);
  const [uploadStep, setUploadStep] = useState("");

  useEffect(() => {
    if (!hasSupabaseAuthConfig()) {
      setUser(null); // auth not configured — treat as unauthenticated
      return;
    }
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignIn = async (provider: "github" | "google") => {
    setAuthLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/upload`,
          ...(provider === "github" ? { scopes: "read:user user:email" } : {}),
        },
      });
    } catch {
      setAuthLoading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setStatus("validating");
    setErrorMsg("");
    setUploadedRunId(null);
    setUploadedCount(0);
    setUploadStep("");

    try {
      const text = await selectedFile.text();
      const json = JSON.parse(text);

      const parsed = benchmarkUploadSchema.safeParse(json);

      if (!parsed.success) {
        setStatus("error");
        setErrorMsg("Invalid schema: " + parsed.error.issues[0].message);
        return;
      }

      const payload = parsed.data;

      setStatus("uploading");
      setUploadStep("Sending benchmark data to local database...");

      const response = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload satisfies BenchmarkUpload),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const details = Array.isArray(result?.details)
          ? result.details.join(" ")
          : result?.details || result?.error || "Unknown server error.";
        throw new Error(details);
      }

      setUploadedRunId(payload.run_id);
      setUploadedCount(payload.results.length);
      setStatus("success");

    } catch (e: unknown) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Failed to upload JSON file.");
    }
  };

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <p className="label mb-3">Data Ingest</p>
        <h1 className="font-serif text-5xl font-semibold tracking-tight text-ink mb-4">
          Upload
        </h1>
        <p className="text-stone leading-relaxed">
          Upload your <code className="px-2 py-1 bg-paper-dark text-ink text-sm font-mono border border-border">results-v1.json</code> generated
          by the Summary Arena CLI. The file is written into a local SQLite database for now.
        </p>
      </div>

      {/* Auth gate */}
      {user === undefined ? (
        <div className="panel p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-stone" />
        </div>
      ) : user === null ? (
        <div className="panel p-10 bg-[linear-gradient(135deg,_#fffdf8,_#f3ece2)] border-terracotta/30 space-y-6 text-center">
          <div className="w-16 h-16 border border-border flex items-center justify-center mx-auto">
            <LogIn className="w-7 h-7 text-terracotta" strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-serif text-xl font-semibold text-ink mb-1">Sign in to upload</p>
            <p className="text-stone text-sm">You need to be signed in to submit benchmark results.</p>
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              onClick={() => handleSignIn("github")}
              disabled={authLoading}
              className="btn-primary inline-flex items-center gap-2"
            >
              {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GithubIcon />}
              Continue with GitHub
            </button>
            <button
              onClick={() => handleSignIn("google")}
              disabled={authLoading}
              className="btn-secondary inline-flex items-center gap-2"
            >
              {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
              Continue with Google
            </button>
          </div>
        </div>
      ) : (
        <div
        className={`panel relative overflow-hidden p-12 transition-all duration-200 ${dragActive ? 'ring-2 ring-terracotta bg-terracotta-light' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".json,application/json"
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />

        <div className="flex flex-col items-center justify-center text-center space-y-6 pointer-events-none relative">
          {status === "idle" && (
            <>
              <div className="w-16 h-16 border border-border flex items-center justify-center">
                <UploadCloud className="w-7 h-7 text-terracotta" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-serif text-xl font-semibold text-ink mb-1">Drop JSON file here</p>
                <p className="text-stone text-sm">or click to browse your filesystem</p>
              </div>
            </>
          )}

          {status === "validating" && (
            <>
              <div className="w-16 h-16 border border-terracotta flex items-center justify-center animate-pulse">
                <FileJson className="w-7 h-7 text-terracotta" strokeWidth={1.5} />
              </div>
              <p className="label text-terracotta animate-pulse">Validating...</p>
            </>
          )}

          {status === "uploading" && (
            <>
              <div className="w-16 h-16 border border-terracotta flex items-center justify-center animate-pulse">
                <FileJson className="w-7 h-7 text-terracotta" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-serif text-xl font-semibold text-ink mb-1">Uploading to local SQLite database</p>
                <p className="text-stone text-sm">{uploadStep || "Sending benchmark data..."}</p>
              </div>
            </>
          )}

          {status === "success" && (
            <>
              <div className="w-16 h-16 bg-olive flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-white" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-serif text-xl font-semibold text-olive mb-1">Upload complete</p>
                <p className="text-stone text-sm">
                  {file?.name} has been added to the local database.
                </p>
                <p className="mt-2 text-xs uppercase tracking-wider text-stone-light">
                  {uploadedCount} test results saved{uploadedRunId ? ` • run ${uploadedRunId}` : ""}
                </p>
              </div>
            </>
          )}

          {status === "error" && (
            <>
              <div className="w-16 h-16 bg-rose-light flex items-center justify-center" style={{ backgroundColor: '#FEE2E2' }}>
                <AlertTriangle className="w-7 h-7 text-rose" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-serif text-xl font-semibold text-rose mb-1">Validation error</p>
                <p className="text-stone text-sm">{errorMsg}</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setStatus("idle");
                    setFile(null);
                    setUploadStep("");
                  }}
                  className="mt-4 btn-secondary pointer-events-auto"
                >
                  Try again
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="currentColor" aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}