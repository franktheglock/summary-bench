import { createBrowserClient } from "@supabase/ssr";

function getSupabaseBrowserConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabasePublishableKey) {
    return null;
  }

  return { supabaseUrl, supabasePublishableKey };
}

export function hasSupabaseAuthConfig() {
  return Boolean(getSupabaseBrowserConfig());
}

export function createSupabaseBrowserClient() {
  const config = getSupabaseBrowserConfig();

  if (!config) {
    throw new Error("Supabase browser auth environment variables are missing.");
  }

  return createBrowserClient(config.supabaseUrl, config.supabasePublishableKey);
}
