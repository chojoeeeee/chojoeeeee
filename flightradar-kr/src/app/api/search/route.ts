import { NextResponse } from "next/server";
import { parseSearchParams, toRequest } from "@/features/flight-search/schema";
import { searchAll } from "@/features/flight-search/service";

export const dynamic = "force-dynamic";

/** Full comparison across all six sources. */
export async function GET(req: Request) {
  const parsed = parseSearchParams(Object.fromEntries(new URL(req.url).searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  }
  return NextResponse.json(await searchAll(toRequest(parsed.data)));
}
