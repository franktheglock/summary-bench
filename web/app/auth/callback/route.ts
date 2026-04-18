import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient, hasSupabaseAuthConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getSafeNextPath(nextPath: string | null) {
  if (!nextPath || !nextPath.startsWith("/")) {
    return "/";
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
  const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);

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
  } else if (sessionData?.user) {
    const user = sessionData.user;
    const meta = user.user_metadata ?? {};

    // On first-ever signup, lock in the display name from the initial provider.
    // On subsequent logins (even with a different linked provider), restore it
    // so OAuth metadata updates don't silently rename the user.
    if (!meta.initial_display_name) {
      // First login — store whatever name the provider gave us
      const firstProviderName =
        (meta.full_name as string | undefined) ??
        (meta.name as string | undefined) ??
        (meta.user_name as string | undefined) ??
        user.email ??
        "";
      await supabase.auth.updateUser({
        data: { initial_display_name: firstProviderName },
      });
    } else {
      // Subsequent login — if the provider overwrote full_name, restore it
      if (meta.full_name !== meta.initial_display_name) {
        await supabase.auth.updateUser({
          data: { full_name: meta.initial_display_name },
        });
      }
    }
  }

  return NextResponse.redirect(redirectUrl);
}
