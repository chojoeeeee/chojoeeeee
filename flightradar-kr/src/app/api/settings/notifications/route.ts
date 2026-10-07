import { NextResponse } from "next/server";
import { notificationSettingsSchema } from "@/features/watchlist/schema";
import { getStore, isSameOriginJson, loadNotificationSettings, ownerId, telegramStatus } from "@/features/watchlist/service";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ settings: await loadNotificationSettings(), telegram: telegramStatus() });
}

export async function POST(req: Request) {
  if (!isSameOriginJson(req)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const parsed = notificationSettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const next = { ...(await loadNotificationSettings()), ...parsed.data, userId: ownerId() };
  await getStore().saveNotificationSettings(next);
  return NextResponse.json({ settings: next });
}
