import { NextResponse } from "next/server";

import { getLeaderboardRows, getCategories } from "@/lib/arena-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || undefined;
  
  const rows = getLeaderboardRows(category);
  const categories = getCategories();

  return NextResponse.json({ ok: true, rows, categories });
}
