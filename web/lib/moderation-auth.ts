import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient, hasSupabaseAuthConfig } from "@/lib/supabase/server";

function parseCsvEnv(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function getAllowedModeratorEmails() {
  return parseCsvEnv(process.env.SUMMARYARENA_MODERATOR_EMAILS);
}

function getAllowedModeratorIds() {
  return parseCsvEnv(process.env.SUMMARYARENA_MODERATOR_IDS);
}

export function isModeratorUser(user: Pick<User, "id" | "email"> | null) {
  if (!user) {
    return false;
  }

  const allowedEmails = getAllowedModeratorEmails();
  const allowedIds = getAllowedModeratorIds();
  const email = user.email?.trim().toLowerCase();
  const id = user.id.trim().toLowerCase();

  return (email ? allowedEmails.includes(email) : false) || allowedIds.includes(id);
}

export async function getModeratorContext() {
  if (!hasSupabaseAuthConfig()) {
    return {
      authConfigured: false,
      user: null,
      isModerator: false,
    } as const;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    authConfigured: true,
    user,
    isModerator: isModeratorUser(user),
  } as const;
}

export function getModeratorDisplayName(user: Pick<User, "email" | "id">) {
  return user.email?.trim() || user.id;
}
