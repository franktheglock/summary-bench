import { NextResponse } from "next/server";

import { getTemporaryUploadLink } from "@/lib/arena-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.json({ error: "Temporary upload token is required." }, { status: 400 });
  }

  const link = await getTemporaryUploadLink(token);
  if (!link) {
    return NextResponse.json({ error: "Temporary upload link is invalid or expired." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, ...link });
}