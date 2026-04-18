"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Save, Trash2, AlertTriangle, CheckCircle, ExternalLink } from "lucide-react";
import type { User } from "@supabase/supabase-js";

import { createSupabaseBrowserClient, hasSupabaseAuthConfig } from "@/lib/supabase/browser";
import type { UploaderRun } from "@/lib/arena-store";

// ── helpers ────────────────────────────────────────────────────────────────

function getOAuthAvatarUrl(user: User): string | null {
  return (user.user_metadata?.avatar_url as string | undefined) ?? null;
}

function getCustomAvatarUrl(user: User): string | null {
  return (user.user_metadata?.custom_avatar_url as string | undefined) ?? null;
}

function getEffectiveAvatarUrl(user: User): string | null {
  return getCustomAvatarUrl(user) ?? getOAuthAvatarUrl(user);
}

function getDisplayName(user: User): string {
  return (
    (user.user_metadata?.display_name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    (user.user_metadata?.user_name as string | undefined) ??
    user.email ??
    "Account"
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Avatar component ───────────────────────────────────────────────────────

function Avatar({ user, size = 96 }: { user: User; size?: number }) {
  const avatarUrl = getEffectiveAvatarUrl(user);
  const name = getDisplayName(user);
  const px = `${size}px`;

  return (
    <div
      className="rounded-full overflow-hidden bg-stone-200 flex items-center justify-center shrink-0 border-2 border-border"
      style={{ width: px, height: px }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="font-bold text-stone" style={{ fontSize: `${size * 0.3}px` }}>
          {getInitials(name)}
        </span>
      )}
    </div>
  );
}

// ── Submitted models section ───────────────────────────────────────────────

function SubmittedModels({ userId }: { userId: string }) {
  const [runs, setRuns] = useState<UploaderRun[] | null>(null);

  useEffect(() => {
    fetch(`/api/profile/runs?uid=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((data) => setRuns(Array.isArray(data.runs) ? data.runs : []))
      .catch(() => setRuns([]));
  }, [userId]);

  if (runs === null) {
    return (
      <div className="panel p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-stone" />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="panel p-8 text-center space-y-3">
        <p className="text-stone">No benchmark submissions yet.</p>
        <Link href="/upload" className="btn-primary inline-flex items-center gap-2">
          Upload your first run
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {runs.map((run) => (
        <div key={run.run_id} className="panel p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-ink text-sm">{run.model}</span>
              <span className="text-[10px] uppercase tracking-wider text-stone-light bg-paper-dark border border-border px-1.5 py-0.5">
                {run.provider}
              </span>
            </div>
            <p className="text-xs text-stone mt-0.5">
              {run.result_count} results · {new Date(run.timestamp).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
            </p>
          </div>
          <Link
            href={`/model/${encodeURIComponent(run.model)}`}
            className="shrink-0 text-stone hover:text-terracotta transition-colors"
            title="View model page"
          >
            <ExternalLink className="w-4 h-4" />
          </Link>
        </div>
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  // Settings form state
  const [displayName, setDisplayName] = useState("");
  const [customAvatarUrl, setCustomAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasSupabaseAuthConfig()) {
      router.replace("/");
      return;
    }
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/");
        return;
      }
      setUser(data.user);
      setDisplayName(
        (data.user.user_metadata?.display_name as string | undefined) ?? getDisplayName(data.user)
      );
      setCustomAvatarUrl((data.user.user_metadata?.custom_avatar_url as string | undefined) ?? "");
    });
  }, [router]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaveStatus("idle");
    setSaveError("");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error, data } = await supabase.auth.updateUser({
        data: {
          display_name: displayName.trim() || undefined,
          custom_avatar_url: customAvatarUrl.trim() || null,
        },
      });
      if (error) throw error;
      if (data.user) setUser(data.user);
      setSaveStatus("success");
      saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (e) {
      setSaveStatus("error");
      setSaveError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/profile/delete", { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Deletion failed.");

      // Sign out locally then redirect
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      router.replace("/");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Deletion failed.");
      setDeleting(false);
    }
  };

  if (user === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-6 h-6 animate-spin text-stone" />
      </div>
    );
  }

  if (!user) return null;

  const avatarPreview = customAvatarUrl.trim() || getOAuthAvatarUrl(user) || null;
  const initials = getInitials(displayName || getDisplayName(user));
  const CONFIRM_PHRASE = "delete my account";

  return (
    <div className="max-w-2xl space-y-10">
      {/* Header */}
      <div className="flex items-center gap-6">
        <Avatar user={{ ...user, user_metadata: { ...user.user_metadata, custom_avatar_url: customAvatarUrl.trim() || null } }} size={80} />
        <div>
          <p className="label mb-1">Your Profile</p>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink">
            {displayName || getDisplayName(user)}
          </h1>
          <p className="text-stone text-sm mt-0.5">{user.email}</p>
        </div>
      </div>

      {/* Settings panel */}
      <div className="panel p-6 space-y-6">
        <h2 className="font-semibold text-ink text-base uppercase tracking-widest text-xs label">Settings</h2>

        {/* Display name */}
        <div className="space-y-1.5">
          <label className="label block" htmlFor="display-name">Display name</label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            maxLength={60}
            className="w-full px-3 py-2 border border-border bg-paper text-ink text-sm font-sans focus:outline-none focus:border-terracotta transition-colors"
          />
          <p className="text-[11px] text-stone-light">Shown on your profile. Does not change your auth provider name.</p>
        </div>

        {/* Custom avatar URL */}
        <div className="space-y-1.5">
          <label className="label block" htmlFor="avatar-url">Custom avatar URL</label>
          <div className="flex items-center gap-3">
            <input
              id="avatar-url"
              type="url"
              value={customAvatarUrl}
              onChange={(e) => setCustomAvatarUrl(e.target.value)}
              placeholder="https://…"
              className="flex-1 px-3 py-2 border border-border bg-paper text-ink text-sm font-sans focus:outline-none focus:border-terracotta transition-colors"
            />
            {/* Preview */}
            <div className="w-10 h-10 rounded-full overflow-hidden bg-stone-200 flex items-center justify-center border border-border shrink-0">
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarPreview} alt="preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="text-[10px] font-bold text-stone">{initials}</span>
              )}
            </div>
          </div>
          <p className="text-[11px] text-stone-light">Leave empty to use your OAuth provider&apos;s avatar.</p>
        </div>

        {/* Save */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary inline-flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save changes
          </button>
          {saveStatus === "success" && (
            <span className="flex items-center gap-1.5 text-sm text-olive">
              <CheckCircle className="w-4 h-4" /> Saved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="text-sm text-terracotta-dark">{saveError}</span>
          )}
        </div>
      </div>

      {/* Submitted models */}
      <div className="space-y-4">
        <h2 className="label">Submitted Models</h2>
        <SubmittedModels userId={user.id} />
      </div>

      {/* Danger zone */}
      <div className="panel p-6 border-rose-200 space-y-4" style={{ borderColor: "#FCA5A5" }}>
        <h2 className="label text-rose-500" style={{ color: "#EF4444" }}>Danger zone</h2>
        {!showDeleteConfirm ? (
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-ink">Delete account</p>
              <p className="text-xs text-stone mt-0.5">Permanently remove your account. This cannot be undone.</p>
            </div>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="btn-secondary shrink-0 inline-flex items-center gap-2 border-rose-300 text-rose-500 hover:border-rose-500"
              style={{ borderColor: "#FCA5A5", color: "#EF4444" }}
            >
              <Trash2 className="w-4 h-4" />
              Delete account
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-rose-50 border border-rose-200" style={{ backgroundColor: "#FEF2F2", borderColor: "#FECACA" }}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#EF4444" }} />
              <p className="text-sm text-ink">
                This will permanently delete your account and cannot be undone. Your submitted benchmark runs will remain on the leaderboard.
                Type <span className="font-mono font-semibold">{CONFIRM_PHRASE}</span> to confirm.
              </p>
            </div>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              className="w-full px-3 py-2 border border-border bg-paper text-ink text-sm font-mono focus:outline-none focus:border-rose-400 transition-colors"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={handleDeleteAccount}
                disabled={deleting || deleteConfirmText !== CONFIRM_PHRASE}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-40"
                style={{ background: "#EF4444", borderColor: "#EF4444" }}
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Permanently delete
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); setDeleteError(""); }}
                className="btn-secondary"
                disabled={deleting}
              >
                Cancel
              </button>
            </div>
            {deleteError && <p className="text-sm text-terracotta-dark">{deleteError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
