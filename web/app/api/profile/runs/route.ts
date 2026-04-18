import { NextResponse, type NextRequest } from "next/server";

import { getRunsByUploader } from "@/lib/arena-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const uid = request.nextUrl.searchParams.get("uid");
  if (!uid) {
    return NextResponse.json({ error: "uid is required." }, { status: 400 });
  }

  const runs = await getRunsByUploader(uid);
  return NextResponse.json({ runs });
}
