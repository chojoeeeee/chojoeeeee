import { NextResponse } from "next/server";
import { patchWatchlistSchema } from "@/features/watchlist/schema";
import { getStore, isSameOriginJson, ownerId } from "@/features/watchlist/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function owned(id: string) {
  const w = await getStore().getWatchlist(id);
  return w && w.userId === ownerId() ? w : undefined;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isSameOriginJson(req)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (!(await owned(id))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const parsed = patchWatchlistSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  return NextResponse.json({ watchlist: await getStore().updateWatchlist(id, parsed.data) });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (!(await owned(id))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await getStore().deleteWatchlist(id);
  return NextResponse.json({ ok: true });
}
