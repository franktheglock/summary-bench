import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

function getSupabaseServerAuthConfig() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
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

export async function createSupabaseServerClient(response?: NextResponse) {
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
      setAll(cookiesToSet, headers) {
        if (response) {
          // Route Handler: write cookies directly to the response
          // (Next.js 16 makes cookies() read-only in Route Handlers)
          cookiesToSet.forEach(({ name, value, options }) => {
            if (value) {
              response.cookies.set(name, value, options);
            } else {
              response.cookies.delete(name);
            }
          });
          if (headers) {
            Object.entries(headers).forEach(([key, value]) => {
              response.headers.set(key, value);
            });
          }
        } else {
          // Server Component: try cookieStore.set() (may throw in Next.js 16)
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot always mutate cookies directly.
          }
        }
      },
    },
  });
}
