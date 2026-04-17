import { type NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient, hasSupabaseAuthConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (hasSupabaseAuthConfig()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  return NextResponse.redirect(new URL("/moderator", request.url), { status: 302 });
}
