import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getSupabaseServerAuthConfig() {
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
  return Boolean(getSupabaseServerAuthConfig());
}

export async function createSupabaseServerClient() {
  const config = getSupabaseServerAuthConfig();

  if (!config) {
    throw new Error("Supabase server auth environment variables are missing.");
  }

  const cookieStore = await cookies();

  return createServerClient(config.supabaseUrl, config.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always mutate cookies directly.
        }
      },
    },
  });
}
