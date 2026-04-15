import { NextResponse } from "next/server";

import {
  getVoteCandidate,
  recordVote,
  type VoteChoice,
} from "@/lib/arena-store";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const rateLimit = checkRateLimit(request, {
    id: "arena:get",
    maxRequests: 90,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return createRateLimitResponse(rateLimit, "Too many arena requests. Please slow down.");
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || undefined;
  const excludeTestId = searchParams.get("excludeTestId") || undefined;
  
  const candidate = await getVoteCandidate(category, { excludeTestId });

  if (!candidate) {
    return NextResponse.json(
      {
        ok: false,
        error: "No comparable uploaded summaries are available yet.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, candidate });
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, {
    id: "arena:post",
    maxRequests: 30,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return createRateLimitResponse(rateLimit, "Too many vote submissions. Please wait a moment.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const data = payload as {
    vote?: VoteChoice;
    candidate?: Awaited<ReturnType<typeof getVoteCandidate>>;
  };

  if (!data.vote || !data.candidate) {
    return NextResponse.json(
      { error: "Vote and candidate are required." },
      { status: 400 }
    );
  }

  try {
    await recordVote(data.candidate, data.vote);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    return NextResponse.json(
      { error: "Failed to save vote.", details: message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
