"use client";

import { useState } from "react";
import { Github, Loader2 } from "lucide-react";

import { createSupabaseBrowserClient, hasSupabaseAuthConfig } from "@/lib/supabase/browser";

export default function ModeratorLoginButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);

    if (!hasSupabaseAuthConfig()) {
      setError("Supabase auth environment variables are missing.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const origin = window.location.origin;
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: `${origin}/auth/callback?next=/moderator`,
          scopes: "read:user user:email",
        },
      });

      if (signInError) {
        throw signInError;
      }
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Failed to start GitHub OAuth.");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <button onClick={handleLogin} className="btn-primary inline-flex items-center gap-2" disabled={loading}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
        Continue with GitHub
      </button>
      {error ? <p className="text-sm text-terracotta-dark">{error}</p> : null}
    </div>
  );
}
