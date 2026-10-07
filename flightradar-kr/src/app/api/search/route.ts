import { NextResponse } from "next/server";
import { parseSearchParams, toRequest } from "@/features/flight-search/schema";
import { searchFlights } from "@/features/flight-search/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const raw = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = parseSearchParams(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  }
  const result = await searchFlights(toRequest(parsed.data));
  return NextResponse.json(result);
}
