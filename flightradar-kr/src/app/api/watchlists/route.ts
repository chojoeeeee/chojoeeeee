import { NextResponse } from "next/server";
import { createWatchlistSchema } from "@/features/watchlist/schema";
import { createWatchlist, getStore, isSameOriginJson, ownerId } from "@/features/watchlist/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({ watchlists: await getStore().listWatchlists(ownerId()) });
}

export async function POST(req: Request) {
  if (!isSameOriginJson(req)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const parsed = createWatchlistSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  const { watchlist, outcome } = await createWatchlist(parsed.data);
  return NextResponse.json({ watchlist, outcome }, { status: 201 });
}
