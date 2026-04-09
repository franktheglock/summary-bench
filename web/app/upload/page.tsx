"use client";

import { useState } from "react";
import { UploadCloud, FileJson, CheckCircle, AlertTriangle } from "lucide-react";
import { benchmarkUploadSchema, type BenchmarkUpload } from "@/lib/upload-schema";

export default function UploadPage() {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "validating" | "uploading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [uploadedRunId, setUploadedRunId] = useState<string | null>(null);
  const [uploadedCount, setUploadedCount] = useState<number>(0);
  const [uploadStep, setUploadStep] = useState("");

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

    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e?.message || "Failed to upload JSON file.");
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
    </div>
  );
}