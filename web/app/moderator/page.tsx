import ModeratorDashboardClient from "./dashboard-client";
import ModeratorLoginButton from "./login-button";

import { getModerationModels } from "@/lib/arena-store";
import { getModeratorContext, getModeratorDisplayName } from "@/lib/moderation-auth";

export default async function ModeratorPage() {
  const moderatorContext = await getModeratorContext();

  if (!moderatorContext.authConfigured) {
    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <p className="label mb-3">Moderator Access</p>
          <h1 className="font-serif text-5xl font-semibold tracking-tight text-ink mb-4">Verification Desk</h1>
          <p className="text-stone leading-relaxed">
            Supabase auth is not configured yet. Add `NEXT_PUBLIC_SUPABASE_URL` and a browser-safe publishable or anon key,
            enable GitHub as an auth provider in Supabase, and set `SUMMARYARENA_MODERATOR_EMAILS` or `SUMMARYARENA_MODERATOR_IDS`
            so the dashboard can authorize moderators.
          </p>
        </div>
      </div>
    );
  }

  if (!moderatorContext.user) {
    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <p className="label mb-3">Moderator Access</p>
          <h1 className="font-serif text-5xl font-semibold tracking-tight text-ink mb-4">Verification Desk</h1>
          <p className="text-stone leading-relaxed">
          Sign in with GitHub or Google to access the moderation endpoint and verify that uploaded model identities match what they claim to be.
          </p>
        </div>
        <div className="panel p-8 bg-[linear-gradient(135deg,_#fffdf8,_#f3ece2)] border-terracotta/30 space-y-4">
          <ModeratorLoginButton />
          <p className="text-xs text-stone-light uppercase tracking-wider">
            Access is restricted to moderators listed in the server environment.
          </p>
        </div>
      </div>
    );
  }

  if (!moderatorContext.isModerator) {
    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <p className="label mb-3">Moderator Access</p>
          <h1 className="font-serif text-5xl font-semibold tracking-tight text-ink mb-4">Verification Desk</h1>
          <p className="text-stone leading-relaxed">
            You are signed in, but this account is not authorized to moderate verification status.
          </p>
        </div>
        <div className="panel p-6 bg-terracotta-light border-terracotta/30 space-y-4">
          <p className="text-sm text-ink-light">
            Signed in as <span className="font-mono text-ink">{getModeratorDisplayName(moderatorContext.user)}</span>
          </p>
          <form action="/auth/signout" method="post">
            <button className="btn-secondary" type="submit">Sign out</button>
          </form>
        </div>
      </div>
    );
  }

  const models = await getModerationModels();

  return (
    <ModeratorDashboardClient
      initialModels={models}
      moderatorLabel={getModeratorDisplayName(moderatorContext.user)}
    />
  );
}
