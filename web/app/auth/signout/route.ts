import { type NextRequest, NextResponse } from "next/server";

import {
  createSupabaseServerClient,
  hasSupabaseAuthConfig,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/moderator", request.url), {
    status: 302,
  });

  if (hasSupabaseAuthConfig()) {
    const supabase = await createSupabaseServerClient(response);
    await supabase.auth.signOut();
  }

  return response;
}
