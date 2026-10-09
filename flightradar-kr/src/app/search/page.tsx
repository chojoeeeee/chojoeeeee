import Link from "next/link";
import { SearchForm } from "@/components/SearchForm";
import { SearchRunner } from "@/components/SearchRunner";
import { placeName } from "@/config/airports";
import { parseSearchParams, toRequest } from "@/features/flight-search/schema";
import { listSources } from "@/features/flight-search/service";
import { addDays, todayKst } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parsed = parseSearchParams(await searchParams);
  const today = todayKst();

  if (!parsed.success) {
    const departureDate = addDays(today, 30);
    return (
      <div className="space-y-4">
        <div role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
          <p className="font-bold">검색 조건을 확인해주세요.</p>
          <ul className="mt-1 list-disc pl-5">{parsed.error.issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul>
        </div>
        <SearchForm defaults={{ today, departureDate, returnDate: addDays(departureDate, 3) }} />
        <Link href="/" className="text-sm text-muted underline">처음으로</Link>
      </div>
    );
  }

  const p = parsed.data;
  // Query forwarded to /api/search/source (flex is handled by the page itself).
  const q = new URLSearchParams({ origin: p.origin, destination: p.destination, departureDate: p.departureDate, adults: String(p.adults), children: String(p.children), cabinClass: p.cabinClass });
  if (p.returnDate) q.set("returnDate", p.returnDate);
  if (p.directOnly) q.set("directOnly", "true");
  if (p.nearby) q.set("nearby", "true");

  return <SearchRunner request={toRequest(p)} query={q.toString()} sources={listSources()} label={{ from: placeName(p.origin), to: placeName(p.destination) }} flexDays={p.flex} today={today} />;
}
