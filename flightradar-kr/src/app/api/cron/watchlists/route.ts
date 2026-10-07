import { NextResponse } from "next/server";
import { isCronAuthorized, schedulerRun } from "@/features/watchlist/service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel Cron target. Requires `Authorization: Bearer $CRON_SECRET` (Vercel sends it automatically when
 * CRON_SECRET is set). The run only calls provider parts whose policy allows background polling;
 * with none allowed it ends normally without any network call.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const report = await schedulerRun();
  return NextResponse.json({
    trigger: report.trigger,
    watchlists: report.watchlists,
    searchGroups: report.searchGroups,
    networkCalls: report.networkCalls,
    skippedProviders: report.skippedProviders.map((s) => ({ provider: s.provider, part: s.part, kind: s.kind })),
    outcomes: report.outcomes.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.status]: (acc[o.status] ?? 0) + 1 }), {}),
    notified: report.outcomes.filter((o) => o.notified).length,
  });
}
