import { NextResponse } from "next/server";

import { verifyAllModels } from "@/lib/arena-store";
import { getModeratorContext, getModeratorDisplayName } from "@/lib/moderation-auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    const moderatorContext = await getModeratorContext();

    if (!moderatorContext.user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (!moderatorContext.isModerator) {
      return NextResponse.json({ error: "Moderator access required." }, { status: 403 });
    }

    const verifiedBy = getModeratorDisplayName(moderatorContext.user);
    const result = await verifyAllModels({
      verifiedBy,
      verifiedByUserId: moderatorContext.user.id,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to verify all models." },
      { status: 500 }
    );
  }
}
