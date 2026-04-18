import { NextResponse } from "next/server";

import { createTemporaryUploadLink } from "@/lib/arena-store";
import { getModeratorContext, getModeratorDisplayName } from "@/lib/moderation-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const moderatorContext = await getModeratorContext();

    if (!moderatorContext.user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (!moderatorContext.isModerator) {
      return NextResponse.json({ error: "Moderator access required." }, { status: 403 });
    }

    const { token, expires_at } = await createTemporaryUploadLink({
      createdByLabel: getModeratorDisplayName(moderatorContext.user),
      createdByUserId: moderatorContext.user.id,
      expiresInHours: 24,
    });

    const uploadUrl = new URL("/upload", request.url);
    uploadUrl.searchParams.set("token", token);

    return NextResponse.json({
      ok: true,
      upload_url: uploadUrl.toString(),
      expires_at,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create temporary upload link." },
      { status: 500 }
    );
  }
}