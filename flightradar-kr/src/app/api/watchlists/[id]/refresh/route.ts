import { NextResponse } from "next/server";
import { getStore, isSameOriginJson, ownerId, userRefresh } from "@/features/watchlist/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 다시 확인: a USER action (trigger = "user"). This is the only way Live-only providers such as Skyscanner are called for a watchlist. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSameOriginJson(req)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const w = await getStore().getWatchlist(id);
  if (!w || w.userId !== ownerId()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { outcome, report } = await userRefresh(id);
  return NextResponse.json({ outcome, networkCalls: report?.networkCalls ?? 0 });
}
