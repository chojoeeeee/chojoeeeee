import Link from "next/link";
import { SearchForm } from "@/components/SearchForm";
import { SearchRunner } from "@/components/SearchRunner";
import { getAirport } from "@/config/airports";
import { parseSearchParams, toRequest } from "@/features/flight-search/schema";
import { listSources } from "@/features/flight-search/service";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parsed = parseSearchParams(await searchParams);

  if (!parsed.success) {
    return (
      <div className="space-y-4">
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">검색 조건을 확인해주세요.</p>
          <ul className="mt-1 list-disc pl-5">{parsed.error.issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul>
        </div>
        <SearchForm />
        <Link href="/" className="text-sm text-brand underline">처음으로</Link>
      </div>
    );
  }

  const p = parsed.data;
  // Query string forwarded to /api/search/source (without `sort`, which is client state).
  const q = new URLSearchParams({ origin: p.origin, destination: p.destination, departureDate: p.departureDate, adults: String(p.adults), children: String(p.children), cabinClass: p.cabinClass });
  if (p.returnDate) q.set("returnDate", p.returnDate);
  if (p.directOnly) q.set("directOnly", "true");
  if (p.nearby) q.set("nearby", "true");

  return (
    <SearchRunner
      request={toRequest(p)}
      query={q.toString()}
      sources={listSources()}
      label={{ from: getAirport(p.origin)?.city ?? p.origin, to: getAirport(p.destination)?.city ?? p.destination }}
    />
  );
}
