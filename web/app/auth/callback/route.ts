import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient, hasSupabaseAuthConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getSafeNextPath(nextPath: string | null) {
  if (!nextPath || !nextPath.startsWith("/")) {
    return "/moderator";
  }

  return nextPath;
}

export async function GET(request: NextRequest) {
  const redirectPath = getSafeNextPath(request.nextUrl.searchParams.get("next"));
  const redirectUrl = new URL(redirectPath, request.url);

  if (!hasSupabaseAuthConfig()) {
    redirectUrl.searchParams.set("error", "supabase-auth-missing");
    return NextResponse.redirect(redirectUrl);
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    redirectUrl.searchParams.set("error", "oauth-code-missing");
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Detect email-conflict: user tried a second OAuth provider with same email
    // but Supabase "link same email" is not enabled in the dashboard.
    const msg = error.message?.toLowerCase() ?? "";
    if (
      msg.includes("already been registered") ||
      msg.includes("email address") ||
      msg.includes("provider_email_conflicts") ||
      error.code === "email_exists"
    ) {
      redirectUrl.searchParams.set("error", "email-already-linked");
    } else {
      redirectUrl.searchParams.set("error", "oauth-exchange-failed");
    }
  }

  return NextResponse.redirect(redirectUrl);
}
