import { NextResponse } from "next/server";

import { getLeaderboardRows, getCategories } from "@/lib/arena-store";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const rateLimit = checkRateLimit(request, {
    id: "leaderboard:get",
    maxRequests: 120,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return createRateLimitResponse(rateLimit, "Too many leaderboard requests. Please slow down.");
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || undefined;
  
  const [rows, categories] = await Promise.all([
    getLeaderboardRows(category),
    getCategories(),
  ]);

  return NextResponse.json({ ok: true, rows, categories });
}
