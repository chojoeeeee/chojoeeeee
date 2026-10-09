import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { demoDrop, getStore, isSameOriginJson, ownerId } from "@/features/watchlist/service";

export const dynamic = "force-dynamic";

/** DEMO_MODE only: simulate a price drop on DEMO data and run the real alert pipeline. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (env("DEMO_MODE")?.toLowerCase() !== "true") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { id } = await params;
  if (!isSameOriginJson(req)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const w = await getStore().getWatchlist(id);
  if (!w || w.userId !== ownerId()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const outcome = await demoDrop(id);
  if (!outcome) return NextResponse.json({ error: "no_demo_price", message: "DEMO 가격이 있는 Watchlist에서만 사용할 수 있어요." }, { status: 409 });
  return NextResponse.json({ outcome });
}
