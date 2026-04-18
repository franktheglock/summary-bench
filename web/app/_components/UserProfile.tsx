"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut, ChevronDown, User } from "lucide-react";
import Link from "next/link";
import type { User as SupabaseUser } from "@supabase/supabase-js";

import { createSupabaseBrowserClient, hasSupabaseAuthConfig } from "@/lib/supabase/browser";

function signInWithGitHub() {
  const supabase = createSupabaseBrowserClient();
  const origin = window.location.origin;
  supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: `${origin}/auth/callback?next=${window.location.pathname}`, scopes: "read:user user:email" },
  });
}

function signInWithGoogle() {
  const supabase = createSupabaseBrowserClient();
  const origin = window.location.origin;
  supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback?next=${window.location.pathname}` },
  });
}

function getAvatarUrl(user: SupabaseUser): string | null {
  return (user.user_metadata?.avatar_url as string | undefined) ?? null;
}

function getDisplayName(user: SupabaseUser): string {
  return (
    (user.user_metadata?.display_name as string | undefined) ??
    (user.user_metadata?.initial_display_name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    (user.user_metadata?.user_name as string | undefined) ??
    user.email ??
    "Account"
  );
}

function getInitials(user: SupabaseUser): string {
  const name = getDisplayName(user);
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function UserProfile() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [open, setOpen] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasSupabaseAuthConfig()) return;

    const supabase = createSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    // Check for auth errors in the URL (e.g. after OAuth callback redirect)
    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get("error");
    if (errorCode === "email-already-linked") {
      setAuthError("An account with that email already exists. Sign in with the provider you used originally.");
      setShowSignIn(true);
      // Clean up the URL without a reload
      const clean = new URL(window.location.href);
      clean.searchParams.delete("error");
      window.history.replaceState({}, "", clean.toString());
    } else if (errorCode === "oauth-exchange-failed") {
      setAuthError("Sign-in failed. Please try again.");
      setShowSignIn(true);
      const clean = new URL(window.location.href);
      clean.searchParams.delete("error");
      window.history.replaceState({}, "", clean.toString());
    }

    return () => subscription.unsubscribe();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowSignIn(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  if (!hasSupabaseAuthConfig()) return null;

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    setOpen(false);
    window.location.reload();
  };

  const avatarUrl = user ? getAvatarUrl(user) : null;

  return (
    <div className="relative" ref={dropdownRef}>
      {user ? (
        <>
          <button
            onClick={() => { setOpen(!open); setShowSignIn(false); }}
            className="flex items-center gap-2 group rounded-full focus:outline-none"
            aria-label="Account menu"
          >
            <div className="w-8 h-8 rounded-full overflow-hidden bg-stone-200 flex items-center justify-center shrink-0 border border-border group-hover:border-terracotta transition-colors">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={getDisplayName(user)} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="text-[10px] font-bold text-stone">{getInitials(user)}</span>
              )}
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-stone group-hover:text-ink transition-all ${open ? "rotate-180" : ""}`} />
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-paper border border-border shadow-lg z-50 py-1">
              <div className="px-3 py-2.5 border-b border-border">
                <p className="text-xs font-semibold text-ink leading-tight truncate">{getDisplayName(user)}</p>
                {user.email && <p className="text-[10px] text-stone-light truncate mt-0.5">{user.email}</p>}
              </div>
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone hover:text-ink hover:bg-paper-dark transition-colors"
              >
                <User className="w-3.5 h-3.5" />
                Profile &amp; settings
              </Link>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone hover:text-ink hover:bg-paper-dark transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <button
            onClick={() => { setShowSignIn(!showSignIn); setOpen(false); }}
            className="flex items-center gap-1.5 text-sm font-medium text-stone uppercase tracking-wider hover:text-ink transition-colors"
            aria-label="Sign in"
          >
            <User className="w-4 h-4" />
            <span className="hidden sm:inline">Sign in</span>
          </button>

          {showSignIn && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-paper border border-border shadow-lg z-50 py-2 px-3 space-y-2">
              {authError && (
                <p className="text-[11px] text-terracotta leading-snug pb-1 border-b border-border">{authError}</p>
              )}
              <p className="text-[10px] uppercase tracking-widest text-stone-light pb-1">Sign in with</p>
              <button
                onClick={signInWithGitHub}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-ink bg-paper-dark hover:bg-stone-100 border border-border transition-colors"
              >
                <GithubIcon />
                GitHub
              </button>
              <button
                onClick={signInWithGoogle}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-ink bg-paper-dark hover:bg-stone-100 border border-border transition-colors"
              >
                <GoogleIcon />
                Google
              </button>
            </div>
          )}
        </>
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
