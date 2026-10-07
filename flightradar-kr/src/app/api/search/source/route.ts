import { NextResponse } from "next/server";
import { parseSearchParams, toRequest } from "@/features/flight-search/schema";
import { searchSource } from "@/features/flight-search/service";

export const dynamic = "force-dynamic";

/** One source's result: GET /api/search/source?provider=skyscanner&origin=ICN&... */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const provider = params.get("provider") ?? "";
  const parsed = parseSearchParams(Object.fromEntries(params.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  }
  const result = await searchSource(provider, toRequest(parsed.data));
  if (!result) return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  return NextResponse.json(result);
}
