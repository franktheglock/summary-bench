import { NextResponse } from "next/server";
import { z } from "zod";

import { setModelVerification } from "@/lib/arena-store";
import { getModeratorContext, getModeratorDisplayName } from "@/lib/moderation-auth";

export const runtime = "nodejs";

const requestSchema = z.object({
  model: z.string().min(1),
  provider: z.string().min(1),
  verified: z.boolean().default(true),
});

export async function POST(request: Request) {
  try {
    const moderatorContext = await getModeratorContext();

    if (!moderatorContext.user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (!moderatorContext.isModerator) {
      return NextResponse.json({ error: "Moderator access required." }, { status: 403 });
    }

    const payload = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid moderation payload." }, { status: 400 });
    }

    const verification = await setModelVerification({
      ...parsed.data,
      verifiedBy: getModeratorDisplayName(moderatorContext.user),
      verifiedByUserId: moderatorContext.user.id,
    });

    return NextResponse.json({ ok: true, verification });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update verification." },
      { status: 500 }
    );
  }
}
