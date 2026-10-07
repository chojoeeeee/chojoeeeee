import { NextResponse } from "next/server";
import { isSameOriginJson, sendTestNotification } from "@/features/watchlist/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isSameOriginJson(req)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const res = await sendTestNotification();
  return NextResponse.json({ ok: res.ok, dryRun: res.dryRun, error: res.error }, { status: res.ok ? 200 : 502 });
}
