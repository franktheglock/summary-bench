import { NextResponse } from "next/server";

import { getLeaderboardRows, getCategories } from "@/lib/arena-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || undefined;
  
  const [rows, categories] = await Promise.all([
    getLeaderboardRows(category),
    getCategories(),
  ]);

  return NextResponse.json({ ok: true, rows, categories });
}
